import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type Request, type Response, type NextFunction } from 'express';
import { GoogleGenAI, Type } from '@google/genai';

const PORT = Number(process.env.PORT) || 3000;
const MODEL_NAME = 'gemini-4-hydrogen';
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);
const ALLOWED_REVISION_TOOLS = new Set([
  'notes',
  'questions',
  'mcq',
  'flashcards',
  'summary',
]);

function loadFirebaseProjectId(): string | undefined {
  if (process.env.FIREBASE_PROJECT_ID) return process.env.FIREBASE_PROJECT_ID.trim();
  if (process.env.VITE_FIREBASE_PROJECT_ID) return process.env.VITE_FIREBASE_PROJECT_ID.trim();
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as { projectId?: string };
      if (parsed.projectId) return parsed.projectId.trim();
    }
  } catch {
    // Ignore unreadable optional local config
  }
  return 'gen-lang-client-0612463551';
}

const FIREBASE_PROJECT_ID = loadFirebaseProjectId();

let cachedCerts: Record<string, string> = {};
let certsExpiresAt = 0;

async function getFirebasePublicCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (now < certsExpiresAt && Object.keys(cachedCerts).length > 0) {
    return cachedCerts;
  }
  const resp = await fetch(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
  );
  if (!resp.ok) {
    throw new Error(`Failed to fetch Firebase public keys (${resp.status})`);
  }
  const cacheControl = resp.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAgeSeconds = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  cachedCerts = (await resp.json()) as Record<string, string>;
  certsExpiresAt = now + maxAgeSeconds * 1000;
  return cachedCerts;
}

function decodeBase64Url(segment: string): Buffer {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

async function verifyFirebaseIdToken(token: string): Promise<{ uid: string }> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed authentication token.');
  }
  const [headerB64, payloadB64, signatureB64] = parts;
  const header = JSON.parse(decodeBase64Url(headerB64).toString('utf8')) as {
    alg?: string;
    kid?: string;
  };
  const payload = JSON.parse(decodeBase64Url(payloadB64).toString('utf8')) as {
    aud?: string;
    iss?: string;
    sub?: string;
    exp?: number;
    iat?: number;
  };

  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Unsupported token signing algorithm.');
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp <= nowSeconds) {
    throw new Error('Authentication token has expired.');
  }
  if (payload.iat && payload.iat > nowSeconds + 300) {
    throw new Error('Authentication token is not yet valid.');
  }
  if (!payload.sub || typeof payload.sub !== 'string') {
    throw new Error('Authentication token missing subject.');
  }

  if (FIREBASE_PROJECT_ID) {
    if (payload.aud !== FIREBASE_PROJECT_ID) {
      throw new Error('Authentication token audience mismatch.');
    }
    if (payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) {
      throw new Error('Authentication token issuer mismatch.');
    }
  }

  const certs = await getFirebasePublicCerts();
  const certPem = certs[header.kid];
  if (!certPem) {
    throw new Error('Unknown token signing key.');
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();
  const valid = verifier.verify(certPem, decodeBase64Url(signatureB64));
  if (!valid) {
    throw new Error('Invalid authentication token signature.');
  }

  return { uid: payload.sub };
}

async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Sign in with Google is required to use AI study tools.' });
    return;
  }
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    res.status(401).json({ error: 'Authentication token is missing.' });
    return;
  }
  try {
    await verifyFirebaseIdToken(token);
    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid authentication session.';
    res.status(401).json({ error: message });
  }
}

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    throw Object.assign(
      new Error(
        'GEMINI_API_KEY is not configured on the server. Set GEMINI_API_KEY in Settings > Secrets.'
      ),
      { statusCode: 500 }
    );
  }
  return new GoogleGenAI({
    apiKey: apiKey.trim(),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function mapGeminiError(err: unknown): { statusCode: number; message: string } {
  if (err && typeof err === 'object' && 'statusCode' in err) {
    const statusCode = Number((err as { statusCode?: number }).statusCode) || 500;
    const message = err instanceof Error ? err.message : 'Request failed.';
    return { statusCode, message };
  }
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('API_KEY_INVALID') || raw.includes('PERMISSION_DENIED')) {
    return {
      statusCode: 403,
      message: 'Invalid or unauthorized Gemini API key. Check GEMINI_API_KEY in Settings > Secrets.',
    };
  }
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429')) {
    return {
      statusCode: 429,
      message: 'Gemini API rate limit reached. Please wait a moment and try again.',
    };
  }
  if (raw.includes('NOT_FOUND') || raw.includes('404')) {
    return {
      statusCode: 404,
      message: 'Requested Gemini model was not found or is unavailable.',
    };
  }
  return {
    statusCode: 502,
    message: raw || 'Failed to generate AI response.',
  };
}

function sanitizeHistory(
  raw: unknown
): Array<{ role: 'user' | 'model'; text: string }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(-12)
    .filter(
      (item): item is { role: unknown; text: unknown } =>
        Boolean(item) && typeof item === 'object'
    )
    .map((item) => ({
      role: (item.role === 'model' ? 'model' : 'user') as 'user' | 'model',
      text: typeof item.text === 'string' ? item.text.slice(0, 4000) : '',
    }))
    .filter((item) => item.text.length > 0);
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/gemini/solve', requireAuth, async (req, res) => {
    try {
      const { question, subject, imageBase64, imageMimeType } = req.body ?? {};
      const cleanQuestion = typeof question === 'string' ? question.trim().slice(0, 4000) : '';
      const cleanSubject = typeof subject === 'string' ? subject.trim().slice(0, 80) : '';
      const cleanImage = typeof imageBase64 === 'string' ? imageBase64.trim() : '';

      if (!cleanQuestion && !cleanImage) {
        res.status(400).json({ error: 'Enter a question or upload an image of your problem.' });
        return;
      }

      const ai = getAiClient();
      const parts: Array<
        { text: string } | { inlineData: { mimeType: string; data: string } }
      > = [];

      if (cleanImage) {
        const mime =
          typeof imageMimeType === 'string' && ALLOWED_IMAGE_MIME_TYPES.has(imageMimeType)
            ? imageMimeType
            : 'image/png';
        const data = cleanImage.includes(',') ? cleanImage.split(',')[1] : cleanImage;
        if (!data || data.length > 9_000_000) {
          res.status(400).json({ error: 'Uploaded image exceeds the allowed size.' });
          return;
        }
        parts.push({
          inlineData: {
            mimeType: mime,
            data,
          },
        });
      }

      parts.push({
        text: `Solve this student assignment problem thoroughly step-by-step.\nSubject hint: ${
          cleanSubject || 'Auto-detect (Mathematics, Programming, Physics, Chemistry, or Theory)'
        }\nQuestion: ${
          cleanQuestion || 'Read and solve the problem shown in the attached image.'
        }`,
      });

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: { parts },
        config: {
          systemInstruction:
            'You are StudyPilot Solver, an accurate academic problem solver for mathematics, programming, science, and theory. Produce a clear step-by-step solution. Put valid LaTeX math expressions inside each step formula field (without surrounding $$ delimiters in the formula field, e.g., "\\frac{dy}{dx} + 2y = x") and use $...$ for inline math inside explanation text. For programming questions, put the clean code snippet or complexity expression in the formula field.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              subject: { type: Type.STRING },
              title: { type: Type.STRING },
              steps: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    stepNumber: { type: Type.INTEGER },
                    title: { type: Type.STRING },
                    explanation: { type: Type.STRING },
                    formula: { type: Type.STRING },
                  },
                  required: ['stepNumber', 'title', 'explanation', 'formula'],
                },
              },
              finalAnswer: { type: Type.STRING },
            },
            required: ['subject', 'title', 'steps', 'finalAnswer'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json(parsed);
    } catch (err) {
      const mapped = mapGeminiError(err);
      res.status(mapped.statusCode).json({ error: mapped.message });
    }
  });

  app.post('/api/gemini/solve-followup', requireAuth, async (req, res) => {
    try {
      const { question, subject, followUpHistory, followUpMessage } = req.body ?? {};
      const cleanMessage =
        typeof followUpMessage === 'string' ? followUpMessage.trim().slice(0, 2000) : '';
      if (!cleanMessage) {
        res.status(400).json({ error: 'Follow-up message is required.' });
        return;
      }

      const cleanQuestion = typeof question === 'string' ? question.trim().slice(0, 4000) : '';
      const cleanSubject = typeof subject === 'string' ? subject.trim().slice(0, 80) : '';
      const history = sanitizeHistory(followUpHistory);
      const contextLines = history
        .map((m) => `${m.role === 'user' ? 'Student' : 'Solver'}: ${m.text}`)
        .join('\n');

      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: `Original Question (${cleanSubject || 'General'}): ${
          cleanQuestion || 'Uploaded problem'
        }\n\nConversation so far:\n${contextLines}\n\nStudent follow-up: ${cleanMessage}`,
        config: {
          systemInstruction:
            'You are StudyPilot Solver, an expert STEM, coding, and theory tutor. Answer the student follow-up clearly and concisely. Wrap inline math in $...$ and block equations in $$...$$ using valid LaTeX. Keep formatting clean and scannable.',
        },
      });

      res.json({ text: response.text ?? 'Unable to generate follow-up response.' });
    } catch (err) {
      const mapped = mapGeminiError(err);
      res.status(mapped.statusCode).json({ error: mapped.message });
    }
  });

  app.post('/api/gemini/assistant', requireAuth, async (req, res) => {
    try {
      const { question, simpleEnglish, history } = req.body ?? {};
      const cleanQuestion = typeof question === 'string' ? question.trim().slice(0, 4000) : '';
      if (!cleanQuestion) {
        res.status(400).json({ error: 'Question is required.' });
        return;
      }

      const useSimple = Boolean(simpleEnglish);
      const cleanHistory = sanitizeHistory(history);
      const priorContext =
        cleanHistory.length > 0
          ? `Previous conversation:\n${cleanHistory
              .slice(-4)
              .map((h) => `${h.role}: ${h.text}`)
              .join('\n')}\n\n`
          : '';

      const toneInstruction = useSimple
        ? 'Explain using super clear, everyday Simple English suitable for a beginner. Avoid dense academic jargon and use concrete analogies.'
        : 'Explain with rigorous university-level clarity while keeping every step structured and intuitive.';

      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: `${priorContext}Student Question: ${cleanQuestion}`,
        config: {
          systemInstruction: `You are StudyPilot AI Learning Assistant. ${toneInstruction} Format your response strictly into four distinct sections: Simple Explanation, Core Formula or Rule, Worked Example, and Line-by-Line Walkthrough. Use clean LaTeX for mathematical expressions inside formula fields (without surrounding $$) and $...$ for inline math in prose.`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              topicTitle: { type: Type.STRING },
              simpleExplanation: { type: Type.STRING },
              coreFormulaOrRule: {
                type: Type.OBJECT,
                properties: {
                  label: { type: Type.STRING },
                  formula: { type: Type.STRING },
                  note: { type: Type.STRING },
                },
                required: ['label', 'formula', 'note'],
              },
              example: {
                type: Type.OBJECT,
                properties: {
                  scenario: { type: Type.STRING },
                  expression: { type: Type.STRING },
                  result: { type: Type.STRING },
                },
                required: ['scenario', 'expression', 'result'],
              },
              walkthrough: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: [
              'topicTitle',
              'simpleExplanation',
              'coreFormulaOrRule',
              'example',
              'walkthrough',
            ],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json(parsed);
    } catch (err) {
      const mapped = mapGeminiError(err);
      res.status(mapped.statusCode).json({ error: mapped.message });
    }
  });

  app.post('/api/gemini/revision', requireAuth, async (req, res) => {
    try {
      const { tool, input } = req.body ?? {};
      if (typeof tool !== 'string' || !ALLOWED_REVISION_TOOLS.has(tool)) {
        res.status(400).json({ error: 'Invalid revision tool requested.' });
        return;
      }
      const cleanInput = typeof input === 'string' ? input.trim().slice(0, 15000) : '';
      if (!cleanInput) {
        res.status(400).json({ error: 'Please enter a topic or paste your study notes first.' });
        return;
      }

      const ai = getAiClient();

      if (tool === 'notes') {
        const response = await ai.models.generateContent({
          model: MODEL_NAME,
          contents: `Create structured, exam-ready short revision notes for:\n${cleanInput}`,
          config: {
            systemInstruction:
              'You are an expert academic summarizer. Create crisp, high-yield bulleted revision notes.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                topic: { type: Type.STRING },
                summaryText: { type: Type.STRING },
                sections: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      heading: { type: Type.STRING },
                      points: { type: Type.ARRAY, items: { type: Type.STRING } },
                    },
                    required: ['heading', 'points'],
                  },
                },
              },
              required: ['topic', 'summaryText', 'sections'],
            },
          },
        });
        res.json(JSON.parse((response.text ?? '{}').trim()));
        return;
      }

      if (tool === 'questions') {
        const response = await ai.models.generateContent({
          model: MODEL_NAME,
          contents: `Generate 5 high-probability exam important questions with model answer key points for:\n${cleanInput}`,
          config: {
            systemInstruction:
              'Generate focused exam preparation questions with concise scoring key points.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                topic: { type: Type.STRING },
                summaryText: { type: Type.STRING },
                questions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      question: { type: Type.STRING },
                      difficulty: { type: Type.STRING },
                      keyPoints: { type: Type.STRING },
                    },
                    required: ['question', 'difficulty', 'keyPoints'],
                  },
                },
              },
              required: ['topic', 'summaryText', 'questions'],
            },
          },
        });
        res.json(JSON.parse((response.text ?? '{}').trim()));
        return;
      }

      if (tool === 'mcq') {
        const response = await ai.models.generateContent({
          model: MODEL_NAME,
          contents: `Generate a 5-question multiple choice quiz for:\n${cleanInput}`,
          config: {
            systemInstruction:
              'Create 5 challenging, unambiguous 4-option multiple choice questions with accurate correctIndex (0-3) and brief explanation.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                topic: { type: Type.STRING },
                summaryText: { type: Type.STRING },
                mcqs: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      question: { type: Type.STRING },
                      options: { type: Type.ARRAY, items: { type: Type.STRING } },
                      correctIndex: { type: Type.INTEGER },
                      explanation: { type: Type.STRING },
                    },
                    required: ['question', 'options', 'correctIndex', 'explanation'],
                  },
                },
              },
              required: ['topic', 'summaryText', 'mcqs'],
            },
          },
        });
        res.json(JSON.parse((response.text ?? '{}').trim()));
        return;
      }

      if (tool === 'flashcards') {
        const response = await ai.models.generateContent({
          model: MODEL_NAME,
          contents: `Create 6 active-recall flashcards for:\n${cleanInput}`,
          config: {
            systemInstruction:
              'Create concise front/back active-recall flashcards with a helpful memory hint.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                topic: { type: Type.STRING },
                summaryText: { type: Type.STRING },
                flashcards: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      front: { type: Type.STRING },
                      back: { type: Type.STRING },
                      hint: { type: Type.STRING },
                    },
                    required: ['front', 'back', 'hint'],
                  },
                },
              },
              required: ['topic', 'summaryText', 'flashcards'],
            },
          },
        });
        res.json(JSON.parse((response.text ?? '{}').trim()));
        return;
      }

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: `Generate a rapid 5-minute last-minute revision summary for:\n${cleanInput}`,
        config: {
          systemInstruction:
            'Create a high-speed 5-minute exam cram summary with core takeaways, one must-remember formula/rule, and a 4-item recall checklist.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              topic: { type: Type.STRING },
              summaryText: { type: Type.STRING },
              takeaways: { type: Type.ARRAY, items: { type: Type.STRING } },
              mustRememberFormula: { type: Type.STRING },
              fiveMinChecklist: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: [
              'topic',
              'summaryText',
              'takeaways',
              'mustRememberFormula',
              'fiveMinChecklist',
            ],
          },
        },
      });
      res.json(JSON.parse((response.text ?? '{}').trim()));
    } catch (err) {
      const mapped = mapGeminiError(err);
      res.status(mapped.statusCode).json({ error: mapped.message });
    }
  });

  app.post('/api/gemini/language-tutor', requireAuth, async (req, res) => {
    try {
      const { prompt, targetLanguage } = req.body ?? {};
      const cleanPrompt =
        typeof prompt === 'string' && prompt.trim()
          ? prompt.trim().slice(0, 2000)
          : 'Give me one quick academic vocabulary challenge and sentence correction exercise.';
      const cleanLang =
        typeof targetLanguage === 'string' && targetLanguage.trim()
          ? targetLanguage.trim().slice(0, 80)
          : 'Academic English & French';

      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: `Language track: ${cleanLang}\nStudent message: ${cleanPrompt}`,
        config: {
          systemInstruction:
            'You are StudyPilot Language Tutor. Keep responses short, encouraging, and practical: give a quick correction or micro-challenge in 3-5 sentences.',
        },
      });

      res.json({ text: response.text ?? '' });
    } catch (err) {
      const mapped = mapGeminiError(err);
      res.status(mapped.statusCode).json({ error: mapped.message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) {
        next();
        return;
      }
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`StudyPilot server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start StudyPilot server:', err);
  process.exit(1);
});
