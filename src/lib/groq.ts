import { RevisionToolType, SolutionStep } from '../types';

declare const process: { env: { GROQ_API_KEY?: string } };

const GROQ_MODELS_URL = 'https://api.groq.com/openai/v1/models';
const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';

const NON_CHAT_MODEL_PATTERN =
  /whisper|tts|playai|orpheus|guard|safeguard|prompt-guard|embed|rerank|moderation|s2t|asr|allam/i;

const VISION_MODEL_PATTERN = /vision|scout|maverick|llama-4|llava/i;

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

type GroqContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | GroqContentPart[];
}

interface GroqModelEntry {
  id: string;
  active?: boolean;
  object?: string;
}

interface ModelCache {
  apiKey: string;
  textCandidates: string[];
  visionCandidates: string[];
  selectedTextModel: string | null;
  selectedVisionModel: string | null;
  rejectedModels: Set<string>;
}

let modelCache: ModelCache | null = null;
let inflightModelsPromise: Promise<ModelCache> | null = null;

function getGroqApiKey(): string {
  const viteKey =
    typeof import.meta !== 'undefined' &&
    import.meta.env &&
    typeof import.meta.env.VITE_GROQ_API_KEY === 'string'
      ? import.meta.env.VITE_GROQ_API_KEY.trim()
      : '';
  if (viteKey) return viteKey;

  try {
    const fallbackKey =
      typeof process.env.GROQ_API_KEY === 'string'
        ? process.env.GROQ_API_KEY.trim()
        : '';
    if (fallbackKey) return fallbackKey;
  } catch {
    // Ignore if process is unavailable at runtime
  }

  return '';
}

function scoreTextModel(id: string): number {
  const lower = id.toLowerCase();
  if (lower.includes('llama-3.3-70b')) return 100;
  if (lower.includes('llama-4-maverick')) return 95;
  if (lower.includes('llama-4-scout')) return 92;
  if (lower.includes('llama-3.1-70b') || lower.includes('llama3-70b')) return 90;
  if (lower.includes('llama') && lower.includes('70b')) return 88;
  if (lower.includes('llama-3.1-8b')) return 84;
  if (lower.includes('llama')) return 80;
  if (lower.includes('qwen')) return 75;
  if (lower.includes('gpt-oss')) return 72;
  if (lower.includes('deepseek')) return 65;
  if (lower.includes('gemma')) return 60;
  if (lower.includes('mixtral') || lower.includes('mistral')) return 55;
  return 40;
}

function scoreVisionModel(id: string): number {
  const lower = id.toLowerCase();
  if (lower.includes('llama-4-scout')) return 100;
  if (lower.includes('llama-4-maverick')) return 96;
  if (lower.includes('llama-4')) return 92;
  if (lower.includes('llama') && lower.includes('vision')) return 88;
  if (lower.includes('vision')) return 80;
  return 50;
}

async function fetchAvailableGroqModels(apiKey: string, forceRefresh = false): Promise<ModelCache> {
  if (!forceRefresh && modelCache && modelCache.apiKey === apiKey) {
    return modelCache;
  }

  if (!forceRefresh && inflightModelsPromise) {
    return inflightModelsPromise;
  }

  const promise = (async (): Promise<ModelCache> => {
    const response = await fetch(GROQ_MODELS_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const payload = (await response.json().catch(() => ({}))) as {
      data?: GroqModelEntry[];
      error?: { message?: string };
    };

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error(
          'Invalid or unauthorized Groq API key. Please check VITE_GROQ_API_KEY in your environment variables.'
        );
      }
      throw new Error(
        payload.error?.message || `Unable to fetch available Groq models (${response.status}).`
      );
    }

    const rawModels = Array.isArray(payload.data) ? payload.data : [];
    const eligibleIds = rawModels
      .filter((m) => Boolean(m?.id) && m.active !== false && !NON_CHAT_MODEL_PATTERN.test(m.id))
      .map((m) => m.id);

    if (eligibleIds.length === 0) {
      throw new Error('No active chat models were found on this Groq account.');
    }

    const textCandidates = [...eligibleIds].sort((a, b) => scoreTextModel(b) - scoreTextModel(a));
    const visionCandidates = eligibleIds
      .filter((id) => VISION_MODEL_PATTERN.test(id))
      .sort((a, b) => scoreVisionModel(b) - scoreVisionModel(a));

    const previousRejected =
      modelCache && modelCache.apiKey === apiKey ? modelCache.rejectedModels : new Set<string>();

    const nextCache: ModelCache = {
      apiKey,
      textCandidates,
      visionCandidates,
      selectedTextModel: textCandidates.find((id) => !previousRejected.has(id)) || textCandidates[0],
      selectedVisionModel:
        visionCandidates.find((id) => !previousRejected.has(id)) || visionCandidates[0] || null,
      rejectedModels: previousRejected,
    };

    modelCache = nextCache;
    return nextCache;
  })();

  inflightModelsPromise = promise;
  try {
    return await promise;
  } finally {
    if (inflightModelsPromise === promise) {
      inflightModelsPromise = null;
    }
  }
}

function parseJsonResponse<T>(text: string | undefined): T {
  const raw = (text ?? '{}').trim();
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned || '{}') as T;
  } catch {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as T;
    }
    throw new Error('AI returned an unexpected response format. Please try again.');
  }
}

function sanitizeHistory(
  raw: Array<{ role: 'user' | 'model'; text: string }> | undefined
): Array<{ role: 'user' | 'assistant'; text: string }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(-12)
    .map((item) => ({
      role: (item.role === 'model' ? 'assistant' : 'user') as 'user' | 'assistant',
      text: typeof item.text === 'string' ? item.text.slice(0, 4000) : '',
    }))
    .filter((item) => item.text.length > 0);
}

async function sendCompletionRequest(params: {
  apiKey: string;
  model: string;
  messages: GroqMessage[];
  jsonMode?: boolean;
  temperature?: number;
}): Promise<string> {
  const body: Record<string, unknown> = {
    model: params.model,
    messages: params.messages,
    temperature: params.temperature ?? 0.3,
  };

  if (params.jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const response = await fetch(GROQ_CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string; code?: string };
  };

  if (!response.ok) {
    const errMsg = payload.error?.message || `Groq API request failed (${response.status}).`;
    const errCode = (payload.error?.code || '').toLowerCase();

    if (response.status === 401 || response.status === 403) {
      throw new Error(
        'Invalid or unauthorized Groq API key. Please check VITE_GROQ_API_KEY in your environment variables.'
      );
    }
    if (response.status === 429) {
      throw new Error('Groq API rate limit reached. Please wait a moment and try again.');
    }

    const isModelUnavailable =
      response.status === 404 ||
      errCode === 'model_not_found' ||
      errCode === 'model_decommissioned' ||
      /model.*not\s*found|does not exist|decommissioned|not supported/i.test(errMsg);

    const isJsonModeUnsupported =
      params.jsonMode &&
      response.status === 400 &&
      /response_format|json_object|json mode/i.test(errMsg);

    if (isJsonModeUnsupported) {
      return sendCompletionRequest({ ...params, jsonMode: false });
    }

    if (isModelUnavailable) {
      throw Object.assign(new Error(errMsg), { isModelUnavailable: true });
    }

    throw new Error(errMsg);
  }

  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Groq returned an empty response. Please try again.');
  }
  return content;
}

async function callGroqChat(params: {
  messages: GroqMessage[];
  requiresVision?: boolean;
  jsonMode?: boolean;
  temperature?: number;
}): Promise<string> {
  const apiKey = getGroqApiKey();
  if (!apiKey) {
    throw new Error(
      'Groq API key is missing. Set VITE_GROQ_API_KEY in your environment variables (.env or Vercel Project Settings).'
    );
  }

  let cache = await fetchAvailableGroqModels(apiKey);
  const candidates = params.requiresVision
    ? cache.visionCandidates.filter((id) => !cache.rejectedModels.has(id))
    : cache.textCandidates.filter((id) => !cache.rejectedModels.has(id));

  if (candidates.length === 0) {
    cache = await fetchAvailableGroqModels(apiKey, true);
  }

  const pool = params.requiresVision ? cache.visionCandidates : cache.textCandidates;
  const preferred = params.requiresVision ? cache.selectedVisionModel : cache.selectedTextModel;
  const orderedCandidates = [
    ...(preferred && pool.includes(preferred) && !cache.rejectedModels.has(preferred)
      ? [preferred]
      : []),
    ...pool.filter((id) => id !== preferred && !cache.rejectedModels.has(id)),
  ];

  if (orderedCandidates.length === 0) {
    throw Object.assign(
      new Error(
        params.requiresVision
          ? 'No vision-capable model is currently available on this Groq account.'
          : 'No active chat model is currently available on this Groq account.'
      ),
      { isNoVisionModel: params.requiresVision }
    );
  }

  let lastErr: unknown;
  for (const modelId of orderedCandidates) {
    try {
      const content = await sendCompletionRequest({
        apiKey,
        model: modelId,
        messages: params.messages,
        jsonMode: params.jsonMode,
        temperature: params.temperature,
      });
      if (params.requiresVision) {
        cache.selectedVisionModel = modelId;
      } else {
        cache.selectedTextModel = modelId;
      }
      return content;
    } catch (err) {
      lastErr = err;
      const isModelUnavailable =
        typeof err === 'object' &&
        err !== null &&
        'isModelUnavailable' in err &&
        Boolean((err as { isModelUnavailable?: boolean }).isModelUnavailable);

      if (isModelUnavailable) {
        cache.rejectedModels.add(modelId);
        if (cache.selectedTextModel === modelId) cache.selectedTextModel = null;
        if (cache.selectedVisionModel === modelId) cache.selectedVisionModel = null;
        continue;
      }
      throw err;
    }
  }

  throw lastErr instanceof Error
    ? lastErr
    : new Error('Unable to complete request with available Groq models.');
}

export async function solveAssignmentProblem(params: {
  question: string;
  subject?: string;
  imageBase64?: string;
  imageMimeType?: string;
}): Promise<SolvedProblemResult> {
  const cleanQuestion =
    typeof params.question === 'string' ? params.question.trim().slice(0, 4000) : '';
  const cleanSubject =
    typeof params.subject === 'string' ? params.subject.trim().slice(0, 80) : '';
  const cleanImage =
    typeof params.imageBase64 === 'string' ? params.imageBase64.trim() : '';

  if (!cleanQuestion && !cleanImage) {
    throw new Error('Enter a question or upload an image of your problem.');
  }

  const systemPrompt = `You are StudyPilot Solver, an accurate academic problem solver for mathematics, programming, science, and theory.
Return ONLY a valid JSON object matching this exact schema:
{
  "subject": "string",
  "title": "string",
  "steps": [
    {
      "stepNumber": 1,
      "title": "string",
      "explanation": "string (use $...$ for inline math)",
      "formula": "string (clean LaTeX without $$ delimiters, or clean code snippet for programming)"
    }
  ],
  "finalAnswer": "string (use $...$ for math if needed)"
}
Ensure "steps" is a non-empty array with sequential stepNumber values starting at 1.`;

  const promptText = `Solve this student assignment problem thoroughly step-by-step.
Subject hint: ${cleanSubject || 'Auto-detect (Mathematics, Programming, Physics, Chemistry, or Theory)'}
Question: ${cleanQuestion || 'Read and solve the problem shown in the attached image.'}`;

  let raw: string;

  if (cleanImage) {
    const mime =
      typeof params.imageMimeType === 'string' && ALLOWED_IMAGE_MIME_TYPES.has(params.imageMimeType)
        ? params.imageMimeType
        : 'image/png';
    const base64Data = cleanImage.includes(',') ? cleanImage.split(',')[1] : cleanImage;
    if (!base64Data || base64Data.length > 9_000_000) {
      throw new Error('Uploaded image exceeds the allowed size.');
    }
    const imageUrl = cleanImage.startsWith('data:')
      ? cleanImage
      : `data:${mime};base64,${base64Data}`;

    const visionContent: GroqContentPart[] = [
      { type: 'image_url', image_url: { url: imageUrl } },
      { type: 'text', text: promptText },
    ];

    try {
      raw = await callGroqChat({
        requiresVision: true,
        jsonMode: true,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: visionContent },
        ],
      });
    } catch (err) {
      const noVision =
        typeof err === 'object' &&
        err !== null &&
        (('isNoVisionModel' in err && Boolean((err as { isNoVisionModel?: boolean }).isNoVisionModel)) ||
          ('isModelUnavailable' in err &&
            Boolean((err as { isModelUnavailable?: boolean }).isModelUnavailable)));

      if (noVision && cleanQuestion) {
        raw = await callGroqChat({
          requiresVision: false,
          jsonMode: true,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: promptText },
          ],
        });
      } else if (noVision) {
        throw new Error(
          'No active vision model is currently available on your Groq account for image-only uploads. Please type your question text to solve it.'
        );
      } else {
        throw err;
      }
    }
  } else {
    raw = await callGroqChat({
      requiresVision: false,
      jsonMode: true,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: promptText },
      ],
    });
  }

  const parsed = parseJsonResponse<Partial<SolvedProblemResult>>(raw);
  const steps: SolutionStep[] = Array.isArray(parsed.steps)
    ? parsed.steps.map((s, idx) => ({
        stepNumber: Number(s.stepNumber) || idx + 1,
        title: String(s.title || `Step ${idx + 1}`),
        explanation: String(s.explanation || ''),
        formula: String(s.formula || ''),
      }))
    : [];

  return {
    subject: String(parsed.subject || cleanSubject || 'General'),
    title: String(parsed.title || 'Step-by-Step Solution'),
    steps,
    finalAnswer: String(parsed.finalAnswer || ''),
  };
}

export async function solveAssignmentFollowUp(params: {
  question: string;
  subject: string;
  followUpHistory: Array<{ role: 'user' | 'model'; text: string }>;
  followUpMessage: string;
}): Promise<string> {
  const cleanMessage =
    typeof params.followUpMessage === 'string'
      ? params.followUpMessage.trim().slice(0, 2000)
      : '';
  if (!cleanMessage) {
    throw new Error('Follow-up message is required.');
  }

  const cleanQuestion =
    typeof params.question === 'string' ? params.question.trim().slice(0, 4000) : '';
  const cleanSubject =
    typeof params.subject === 'string' ? params.subject.trim().slice(0, 80) : '';
  const history = sanitizeHistory(params.followUpHistory);

  const messages: GroqMessage[] = [
    {
      role: 'system',
      content:
        'You are StudyPilot Solver, an expert STEM, coding, and theory tutor. Answer the student follow-up clearly and concisely. Wrap inline math in $...$ and block equations in $$...$$ using valid LaTeX. Keep formatting clean and scannable.',
    },
    {
      role: 'user',
      content: `Original Question (${cleanSubject || 'General'}): ${cleanQuestion || 'Uploaded problem'}`,
    },
    ...history.slice(0, -1).map((m) => ({
      role: m.role,
      content: m.text,
    })),
    {
      role: 'user',
      content: cleanMessage,
    },
  ];

  return callGroqChat({
    requiresVision: false,
    messages,
  });
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

  const systemPrompt = `You are StudyPilot AI Learning Assistant. ${toneInstruction}
Return ONLY a valid JSON object matching this exact schema:
{
  "topicTitle": "string",
  "simpleExplanation": "string",
  "coreFormulaOrRule": {
    "label": "string",
    "formula": "string (clean LaTeX without $$ delimiters, or plain rule expression)",
    "note": "string"
  },
  "example": {
    "scenario": "string",
    "expression": "string (clean LaTeX without $$ delimiters)",
    "result": "string"
  },
  "walkthrough": ["step 1", "step 2", "step 3", "step 4"]
}
Use $...$ for inline math inside prose fields.`;

  const raw = await callGroqChat({
    requiresVision: false,
    jsonMode: true,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `${priorContext}Student Question: ${cleanQuestion}` },
    ],
  });

  const parsed = parseJsonResponse<Partial<StructuredConceptExplanation>>(raw);
  return {
    topicTitle: String(parsed.topicTitle || cleanQuestion),
    simpleExplanation: String(parsed.simpleExplanation || ''),
    coreFormulaOrRule: {
      label: String(parsed.coreFormulaOrRule?.label || 'Core Rule'),
      formula: String(parsed.coreFormulaOrRule?.formula || ''),
      note: String(parsed.coreFormulaOrRule?.note || ''),
    },
    example: {
      scenario: String(parsed.example?.scenario || ''),
      expression: String(parsed.example?.expression || ''),
      result: String(parsed.example?.result || ''),
    },
    walkthrough: Array.isArray(parsed.walkthrough)
      ? parsed.walkthrough.map((w) => String(w))
      : [],
  };
}

export async function generateRevisionMaterial(params: {
  tool: RevisionToolType;
  input: string;
}): Promise<Record<string, unknown>> {
  if (!ALLOWED_REVISION_TOOLS.has(params.tool)) {
    throw new Error('Invalid revision tool requested.');
  }
  const cleanInput =
    typeof params.input === 'string' ? params.input.trim().slice(0, 15000) : '';
  if (!cleanInput) {
    throw new Error('Please enter a topic or paste your study notes first.');
  }

  if (params.tool === 'notes') {
    const raw = await callGroqChat({
      requiresVision: false,
      jsonMode: true,
      messages: [
        {
          role: 'system',
          content: `You are an expert academic summarizer. Create crisp, high-yield bulleted revision notes.
Return ONLY valid JSON:
{
  "topic": "string",
  "summaryText": "string",
  "sections": [{ "heading": "string", "points": ["string"] }]
}`,
        },
        {
          role: 'user',
          content: `Create structured, exam-ready short revision notes for:\n${cleanInput}`,
        },
      ],
    });
    return parseJsonResponse<Record<string, unknown>>(raw);
  }

  if (params.tool === 'questions') {
    const raw = await callGroqChat({
      requiresVision: false,
      jsonMode: true,
      messages: [
        {
          role: 'system',
          content: `Generate focused exam preparation questions with concise scoring key points.
Return ONLY valid JSON:
{
  "topic": "string",
  "summaryText": "string",
  "questions": [{ "question": "string", "difficulty": "Easy | Medium | Hard", "keyPoints": "string" }]
}`,
        },
        {
          role: 'user',
          content: `Generate 5 high-probability exam important questions with model answer key points for:\n${cleanInput}`,
        },
      ],
    });
    return parseJsonResponse<Record<string, unknown>>(raw);
  }

  if (params.tool === 'mcq') {
    const raw = await callGroqChat({
      requiresVision: false,
      jsonMode: true,
      messages: [
        {
          role: 'system',
          content: `Create 5 challenging, unambiguous 4-option multiple choice questions with accurate correctIndex (integer 0-3) and brief explanation.
Return ONLY valid JSON:
{
  "topic": "string",
  "summaryText": "string",
  "mcqs": [{ "question": "string", "options": ["opt0", "opt1", "opt2", "opt3"], "correctIndex": 0, "explanation": "string" }]
}`,
        },
        {
          role: 'user',
          content: `Generate a 5-question multiple choice quiz for:\n${cleanInput}`,
        },
      ],
    });
    const parsed = parseJsonResponse<{
      topic?: string;
      summaryText?: string;
      mcqs?: Array<{
        question?: string;
        options?: string[];
        correctIndex?: number;
        explanation?: string;
      }>;
    }>(raw);

    const mcqs = Array.isArray(parsed.mcqs)
      ? parsed.mcqs.map((q) => {
          const opts = Array.isArray(q.options) ? q.options.map(String).slice(0, 4) : [];
          const idx = Number(q.correctIndex);
          return {
            question: String(q.question || ''),
            options: opts,
            correctIndex: Number.isInteger(idx) && idx >= 0 && idx < opts.length ? idx : 0,
            explanation: String(q.explanation || ''),
          };
        })
      : [];

    return {
      topic: String(parsed.topic || cleanInput.slice(0, 60)),
      summaryText: String(parsed.summaryText || ''),
      mcqs,
    };
  }

  if (params.tool === 'flashcards') {
    const raw = await callGroqChat({
      requiresVision: false,
      jsonMode: true,
      messages: [
        {
          role: 'system',
          content: `Create concise front/back active-recall flashcards with a helpful memory hint.
Return ONLY valid JSON:
{
  "topic": "string",
  "summaryText": "string",
  "flashcards": [{ "front": "string", "back": "string", "hint": "string" }]
}`,
        },
        {
          role: 'user',
          content: `Create 6 active-recall flashcards for:\n${cleanInput}`,
        },
      ],
    });
    return parseJsonResponse<Record<string, unknown>>(raw);
  }

  const raw = await callGroqChat({
    requiresVision: false,
    jsonMode: true,
    messages: [
      {
        role: 'system',
        content: `Create a high-speed 5-minute exam cram summary with core takeaways, one must-remember formula/rule, and a 4-item recall checklist.
Return ONLY valid JSON:
{
  "topic": "string",
  "summaryText": "string",
  "takeaways": ["string"],
  "mustRememberFormula": "string",
  "fiveMinChecklist": ["string"]
}`,
      },
      {
        role: 'user',
        content: `Generate a rapid 5-minute last-minute revision summary for:\n${cleanInput}`,
      },
    ],
  });
  return parseJsonResponse<Record<string, unknown>>(raw);
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

  return callGroqChat({
    requiresVision: false,
    messages: [
      {
        role: 'system',
        content:
          'You are StudyPilot Language Tutor. Keep responses short, encouraging, and practical: give a quick correction or micro-challenge in 3-5 sentences.',
      },
      {
        role: 'user',
        content: `Language track: ${cleanLang}\nStudent message: ${cleanPrompt}`,
      },
    ],
  });
}
