import { auth } from './firebase';
import { RevisionToolType, SolutionStep } from '../types';

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

async function postGeminiApi<T>(endpoint: string, payload: Record<string, unknown>): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status}).`);
  }
  return data;
}

export async function solveAssignmentProblem(params: {
  question: string;
  subject?: string;
  imageBase64?: string;
  imageMimeType?: string;
}): Promise<SolvedProblemResult> {
  return postGeminiApi<SolvedProblemResult>('/api/gemini/solve', params);
}

export async function solveAssignmentFollowUp(params: {
  question: string;
  subject: string;
  followUpHistory: Array<{ role: 'user' | 'model'; text: string }>;
  followUpMessage: string;
}): Promise<string> {
  const data = await postGeminiApi<{ text: string }>('/api/gemini/solve-followup', params);
  return data.text ?? 'Unable to generate follow-up response.';
}

export async function explainConceptWithAssistant(params: {
  question: string;
  simpleEnglish: boolean;
  history: Array<{ role: 'user' | 'model'; text: string }>;
}): Promise<StructuredConceptExplanation> {
  return postGeminiApi<StructuredConceptExplanation>('/api/gemini/assistant', params);
}

export async function generateRevisionMaterial(params: {
  tool: RevisionToolType;
  input: string;
}): Promise<Record<string, unknown>> {
  return postGeminiApi<Record<string, unknown>>('/api/gemini/revision', params);
}

export async function runLanguageTutorSession(params: {
  prompt: string;
  targetLanguage?: string;
}): Promise<string> {
  const data = await postGeminiApi<{ text: string }>('/api/gemini/language-tutor', params);
  return data.text ?? '';
}
