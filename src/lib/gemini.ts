import { GoogleGenAI, Type } from '@google/genai';
import { RevisionToolType, SolutionStep } from '../types';

declare const process: { env: { GEMINI_API_KEY?: string } };

const MODEL_NAME = 'gemini-4-hydrogen';
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);
const ALLOWED_REVISION_TOOLS = new Set<RevisionToolType>([
  'notes',
  'questions',
  'mcq',
  'flashcards',
  'summary',
]);

export interface SolvedProblemResult {
  subject: string;
  title: string;
  steps: SolutionStep[];
  finalAnswer: string;
}

export interface StructuredConceptExplanation {
  topicTitle: string;
  simpleExplanation: string;
  coreFormulaOrRule: {
    label: string;
    formula: string;
    note: string;
  };
  example: {
    scenario: string;
    expression: string;
    result: string;
  };
  walkthrough: string[];
}

function getGeminiApiKey(): string {
  const viteKey =
    typeof import.meta !== 'undefined' &&
    import.meta.env &&
    typeof import.meta.env.VITE_GEMINI_API_KEY === 'string'
      ? import.meta.env.VITE_GEMINI_API_KEY.trim()
      : '';
  if (viteKey) return viteKey;

  try {
    const studioKey =
      typeof process.env.GEMINI_API_KEY === 'string'
        ? process.env.GEMINI_API_KEY.trim()
        : '';
    if (studioKey) return studioKey;
  } catch {
    // Ignore if process is unavailable at runtime
  }

  return '';
}

function getAiClient(): GoogleGenAI {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error(
      'Gemini API key is not configured. Set VITE_GEMINI_API_KEY in your environment variables (or GEMINI_API_KEY in AI Studio).'
    );
  }
  return new GoogleGenAI({ apiKey });
}

function formatGeminiError(err: unknown): Error {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('API_KEY_INVALID') || raw.includes('PERMISSION_DENIED') || raw.includes('403')) {
    return new Error(
      'Invalid or unauthorized Gemini API key. Check VITE_GEMINI_API_KEY in Vercel or GEMINI_API_KEY in Settings > Secrets.'
    );
  }
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429')) {
    return new Error('Gemini API rate limit reached. Please wait a moment and try again.');
  }
  if (raw.includes('NOT_FOUND') || raw.includes('404')) {
    return new Error('Requested Gemini model was not found or is unavailable.');
  }
  return err instanceof Error ? err : new Error(raw || 'Failed to generate AI response.');
}

function parseJsonResponse<T>(text: string | undefined): T {
  const raw = (text ?? '{}').trim();
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return JSON.parse(cleaned || '{}') as T;
}

function sanitizeHistory(
  raw: Array<{ role: 'user' | 'model'; text: string }> | undefined
): Array<{ role: 'user' | 'model'; text: string }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(-12)
    .map((item) => ({
      role: (item.role === 'model' ? 'model' : 'user') as 'user' | 'model',
      text: typeof item.text === 'string' ? item.text.slice(0, 4000) : '',
    }))
    .filter((item) => item.text.length > 0);
}

export async function solveAssignmentProblem(params: {
  question: string;
  subject?: string;
  imageBase64?: string;
  imageMimeType?: string;
}): Promise<SolvedProblemResult> {
  const cleanQuestion = typeof params.question === 'string' ? params.question.trim().slice(0, 4000) : '';
  const cleanSubject = typeof params.subject === 'string' ? params.subject.trim().slice(0, 80) : '';
  const cleanImage = typeof params.imageBase64 === 'string' ? params.imageBase64.trim() : '';

  if (!cleanQuestion && !cleanImage) {
    throw new Error('Enter a question or upload an image of your problem.');
  }

  try {
    const ai = getAiClient();
    const parts: Array<
      { text: string } | { inlineData: { mimeType: string; data: string } }
    > = [];

    if (cleanImage) {
      const mime =
        typeof params.imageMimeType === 'string' && ALLOWED_IMAGE_MIME_TYPES.has(params.imageMimeType)
          ? params.imageMimeType
          : 'image/png';
      const data = cleanImage.includes(',') ? cleanImage.split(',')[1] : cleanImage;
      if (!data || data.length > 9_000_000) {
        throw new Error('Uploaded image exceeds the allowed size.');
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

    return parseJsonResponse<SolvedProblemResult>(response.text);
  } catch (err) {
    throw formatGeminiError(err);
  }
}

export async function solveAssignmentFollowUp(params: {
  question: string;
  subject: string;
  followUpHistory: Array<{ role: 'user' | 'model'; text: string }>;
  followUpMessage: string;
}): Promise<string> {
  const cleanMessage =
    typeof params.followUpMessage === 'string' ? params.followUpMessage.trim().slice(0, 2000) : '';
  if (!cleanMessage) {
    throw new Error('Follow-up message is required.');
  }

  const cleanQuestion = typeof params.question === 'string' ? params.question.trim().slice(0, 4000) : '';
  const cleanSubject = typeof params.subject === 'string' ? params.subject.trim().slice(0, 80) : '';
  const history = sanitizeHistory(params.followUpHistory);
  const contextLines = history
    .map((m) => `${m.role === 'user' ? 'Student' : 'Solver'}: ${m.text}`)
    .join('\n');

  try {
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

    return response.text ?? 'Unable to generate follow-up response.';
  } catch (err) {
    throw formatGeminiError(err);
  }
}

export async function explainConceptWithAssistant(params: {
  question: string;
  simpleEnglish: boolean;
  history: Array<{ role: 'user' | 'model'; text: string }>;
}): Promise<StructuredConceptExplanation> {
  const cleanQuestion =
    typeof params.question === 'string' ? params.question.trim().slice(0, 4000) : '';
  if (!cleanQuestion) {
    throw new Error('Question is required.');
  }

  const useSimple = Boolean(params.simpleEnglish);
  const cleanHistory = sanitizeHistory(params.history);
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

  try {
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

    return parseJsonResponse<StructuredConceptExplanation>(response.text);
  } catch (err) {
    throw formatGeminiError(err);
  }
}

export async function generateRevisionMaterial(params: {
  tool: RevisionToolType;
  input: string;
}): Promise<Record<string, unknown>> {
  if (!ALLOWED_REVISION_TOOLS.has(params.tool)) {
    throw new Error('Invalid revision tool requested.');
  }
  const cleanInput = typeof params.input === 'string' ? params.input.trim().slice(0, 15000) : '';
  if (!cleanInput) {
    throw new Error('Please enter a topic or paste your study notes first.');
  }

  try {
    const ai = getAiClient();

    if (params.tool === 'notes') {
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
      return parseJsonResponse<Record<string, unknown>>(response.text);
    }

    if (params.tool === 'questions') {
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
      return parseJsonResponse<Record<string, unknown>>(response.text);
    }

    if (params.tool === 'mcq') {
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
      return parseJsonResponse<Record<string, unknown>>(response.text);
    }

    if (params.tool === 'flashcards') {
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
      return parseJsonResponse<Record<string, unknown>>(response.text);
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
    return parseJsonResponse<Record<string, unknown>>(response.text);
  } catch (err) {
    throw formatGeminiError(err);
  }
}

export async function runLanguageTutorSession(params: {
  prompt: string;
  targetLanguage?: string;
}): Promise<string> {
  const cleanPrompt =
    typeof params.prompt === 'string' && params.prompt.trim()
      ? params.prompt.trim().slice(0, 2000)
      : 'Give me one quick academic vocabulary challenge and sentence correction exercise.';
  const cleanLang =
    typeof params.targetLanguage === 'string' && params.targetLanguage.trim()
      ? params.targetLanguage.trim().slice(0, 80)
      : 'Academic English & French';

  try {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: `Language track: ${cleanLang}\nStudent message: ${cleanPrompt}`,
      config: {
        systemInstruction:
          'You are StudyPilot Language Tutor. Keep responses short, encouraging, and practical: give a quick correction or micro-challenge in 3-5 sentences.',
      },
    });

    return response.text ?? '';
  } catch (err) {
    throw formatGeminiError(err);
  }
}
