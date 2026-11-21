import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MODEL_NAME = 'gemini-4-hydrogen';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in environment secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function formatApiError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('PERMISSION_DENIED') || raw.includes('API_KEY_INVALID')) {
    return {
      status: 400,
      message: 'Please verify your Gemini API key in Settings > Secrets.',
    };
  }
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429')) {
    return {
      status: 429,
      message: 'Gemini API rate limit reached. Please wait a moment and try again.',
    };
  }
  return {
    status: 500,
    message: raw || 'An unexpected error occurred while contacting Gemini.',
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'studypilot-api' });
  });

  // 1. AI Assignment Solver (Step-by-step + Multimodal Image + Follow-up)
  app.post('/api/ai/solve', async (req, res) => {
    try {
      const { question, subject, imageBase64, imageMimeType, followUpHistory, followUpMessage } = req.body ?? {};
      const ai = getGeminiClient();

      if (followUpMessage && typeof followUpMessage === 'string') {
        const contextLines = Array.isArray(followUpHistory)
          ? followUpHistory.map((m: { role: string; text: string }) => `${m.role === 'user' ? 'Student' : 'Solver'}: ${m.text}`).join('\n')
          : '';

        const response = await ai.models.generateContent({
          model: MODEL_NAME,
          contents: `Original Question (${subject || 'General'}): ${question || 'Uploaded problem'}\n\nConversation so far:\n${contextLines}\n\nStudent follow-up: ${followUpMessage}`,
          config: {
            systemInstruction:
              'You are StudyPilot Solver, an expert STEM, coding, and theory tutor. Answer the student follow-up clearly and concisely. Wrap inline math in $...$ and block equations in $$...$$ using valid LaTeX. Keep formatting clean and scannable.',
          },
        });

        res.json({ reply: response.text ?? 'Unable to generate follow-up response.' });
        return;
      }

      if (!question && !imageBase64) {
        res.status(400).json({ error: 'Please enter a question or upload a problem image.' });
        return;
      }

      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
      if (imageBase64 && typeof imageBase64 === 'string') {
        const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
        parts.push({
          inlineData: {
            mimeType: typeof imageMimeType === 'string' && imageMimeType ? imageMimeType : 'image/png',
            data: cleanBase64,
          },
        });
      }

      parts.push({
        text: `Solve this student assignment problem thoroughly step-by-step.\nSubject hint: ${subject || 'Auto-detect (Mathematics, Programming, Physics, Chemistry, or Theory)'}\nQuestion: ${question || 'Read and solve the problem shown in the attached image.'}`,
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
              subject: { type: Type.STRING, description: 'Detected academic subject such as Mathematics, Differential Equations, Programming, Physics, or Theory.' },
              title: { type: Type.STRING, description: 'Short descriptive title for the solved problem.' },
              steps: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    stepNumber: { type: Type.INTEGER },
                    title: { type: Type.STRING, description: 'Short step heading like Find the integrating factor.' },
                    explanation: { type: Type.STRING, description: 'Clear explanation of this step; inline LaTeX allowed with $...$.' },
                    formula: { type: Type.STRING, description: 'Primary LaTeX math equation or key code expression for this step, or empty string if none.' },
                  },
                  required: ['stepNumber', 'title', 'explanation', 'formula'],
                },
              },
              finalAnswer: { type: Type.STRING, description: 'Concise final answer with LaTeX wrapped in $...$ if mathematical.' },
            },
            required: ['subject', 'title', 'steps', 'finalAnswer'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json(parsed);
    } catch (err) {
      const formatted = formatApiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 2. AI Learning Assistant (4-section structured concept explainer + Simple English toggle)
  app.post('/api/ai/learn', async (req, res) => {
    try {
      const { question, simpleEnglish, history } = req.body ?? {};
      if (!question || typeof question !== 'string') {
        res.status(400).json({ error: 'Please enter a concept or question to learn.' });
        return;
      }

      const ai = getGeminiClient();
      const priorContext = Array.isArray(history) && history.length > 0
        ? `Previous conversation:\n${history.slice(-4).map((h: { role: string; text: string }) => `${h.role}: ${h.text}`).join('\n')}\n\n`
        : '';

      const toneInstruction = simpleEnglish
        ? 'Explain using super clear, everyday Simple English suitable for a beginner. Avoid dense academic jargon and use concrete analogies.'
        : 'Explain with rigorous university-level clarity while keeping every step structured and intuitive.';

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: `${priorContext}Student Question: ${question}`,
        config: {
          systemInstruction: `You are StudyPilot AI Learning Assistant. ${toneInstruction} Format your response strictly into four distinct sections: Simple Explanation, Core Formula or Rule, Worked Example, and Line-by-Line Walkthrough. Use clean LaTeX for mathematical expressions inside formula fields (without surrounding $$) and $...$ for inline math in prose.`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              topicTitle: { type: Type.STRING },
              simpleExplanation: { type: Type.STRING, description: 'Clear 2-4 sentence explanation of the concept.' },
              coreFormulaOrRule: {
                type: Type.OBJECT,
                properties: {
                  label: { type: Type.STRING, description: 'Name of the formula or core principle.' },
                  formula: { type: Type.STRING, description: 'LaTeX formula or concise rule statement.' },
                  note: { type: Type.STRING, description: 'Meaning of variables or key condition.' },
                },
                required: ['label', 'formula', 'note'],
              },
              example: {
                type: Type.OBJECT,
                properties: {
                  scenario: { type: Type.STRING, description: 'Concrete input values or example setup.' },
                  expression: { type: Type.STRING, description: 'LaTeX worked calculation or code line.' },
                  result: { type: Type.STRING, description: 'Clear final outcome.' },
                },
                required: ['scenario', 'expression', 'result'],
              },
              walkthrough: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '3 to 6 numbered line-by-line walkthrough steps.',
              },
            },
            required: ['topicTitle', 'simpleExplanation', 'coreFormulaOrRule', 'example', 'walkthrough'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json(parsed);
    } catch (err) {
      const formatted = formatApiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 3. Quick Revision Centre (Notes, Important Questions, MCQ Quiz, Flashcards, 5-Min Summary)
  app.post('/api/ai/revise', async (req, res) => {
    try {
      const { tool, input } = req.body ?? {};
      if (!input || typeof input !== 'string') {
        res.status(400).json({ error: 'Please paste study notes or enter a topic first.' });
        return;
      }

      const ai = getGeminiClient();

      if (tool === 'notes') {
        const response = await ai.models.generateContent({
          model: MODEL_NAME,
          contents: `Create structured, exam-ready short revision notes for:\n${input}`,
          config: {
            systemInstruction: 'You are an expert academic summarizer. Create crisp, high-yield bulleted revision notes.',
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
          contents: `Generate 5 high-probability exam important questions with model answer key points for:\n${input}`,
          config: {
            systemInstruction: 'Generate focused exam preparation questions with concise scoring key points.',
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
          contents: `Generate a 5-question multiple choice quiz for:\n${input}`,
          config: {
            systemInstruction: 'Create 5 challenging, unambiguous 4-option multiple choice questions with accurate correctIndex (0-3) and brief explanation.',
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
          contents: `Create 6 active-recall flashcards for:\n${input}`,
          config: {
            systemInstruction: 'Create concise front/back active-recall flashcards with a helpful memory hint.',
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

      // Default: 5 Minutes Revision rapid summary
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: `Generate a rapid 5-minute last-minute revision summary for:\n${input}`,
        config: {
          systemInstruction: 'Create a high-speed 5-minute exam cram summary with core takeaways, one must-remember formula/rule, and a 4-item recall checklist.',
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
            required: ['topic', 'summaryText', 'takeaways', 'mustRememberFormula', 'fiveMinChecklist'],
          },
        },
      });
      res.json(JSON.parse((response.text ?? '{}').trim()));
    } catch (err) {
      const formatted = formatApiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 4. Language Tutor Quick Session (powers Dashboard Language Tutor card)
  app.post('/api/ai/language-tutor', async (req, res) => {
    try {
      const { prompt, targetLanguage } = req.body ?? {};
      const ai = getGeminiClient();

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: `Language track: ${targetLanguage || 'Academic English & French'}\nStudent message: ${prompt || 'Give me one quick academic vocabulary challenge and sentence correction exercise.'}`,
        config: {
          systemInstruction:
            'You are StudyPilot Language Tutor. Keep responses short, encouraging, and practical: give a quick correction or micro-challenge in 3-5 sentences.',
        },
      });

      res.json({ reply: response.text ?? '' });
    } catch (err) {
      const formatted = formatApiError(err);
      res.status(formatted.status).json({ error: formatted.message });
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
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`StudyPilot server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
