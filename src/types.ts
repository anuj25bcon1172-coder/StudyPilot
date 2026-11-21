export type ViewId = 'home' | 'dashboard' | 'assignments' | 'solver' | 'assistant' | 'revision';

export type AssignmentStatus = 'Pending' | 'Completed' | 'Overdue';

export type AttachmentMimeType = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';

export interface AssignmentAttachment {
  name: string;
  mimeType: AttachmentMimeType;
  dataUrl: string;
  sizeBytes: number;
}

export interface Assignment {
  id: string;
  userId: string;
  title: string;
  subject: string;
  dueDate: string; // YYYY-MM-DD
  status: AssignmentStatus;
  questionText?: string;
  questionFile?: AssignmentAttachment | null;
  handwrittenSolution?: AssignmentAttachment | null;
  linkedSolvedAssignmentId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Goal {
  id: string;
  userId: string;
  title: string;
  completed: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface TimelineEvent {
  id: string;
  userId: string;
  title: string;
  time: string;
  date: string; // YYYY-MM-DD
  colorTheme: 'rose' | 'emerald' | 'purple';
  createdAt?: string;
}

export interface SolutionStep {
  stepNumber: number;
  title: string;
  explanation: string;
  formula: string;
}

export interface SavedSolution {
  id: string;
  userId: string;
  question: string;
  subject: string;
  title?: string;
  finalAnswer: string;
  steps: SolutionStep[];
  createdAt?: string;
}

export interface SolvedAssignmentSolution {
  title?: string;
  finalAnswer: string;
  steps: SolutionStep[];
}

export interface SolvedAssignment {
  id: string;
  userId: string;
  assignmentName: string;
  subject: string;
  question: string;
  solution: SolvedAssignmentSolution;
  createdAt?: string;
}

export type RevisionToolType = 'notes' | 'questions' | 'mcq' | 'flashcards' | 'summary';

export interface RevisionItem {
  id: string;
  userId: string;
  toolType: RevisionToolType;
  topic: string;
  summaryText: string;
  items: Array<Record<string, unknown>>;
  createdAt?: string;
}

export interface StudentProfile {
  uid: string;
  displayName: string;
  level: number;
  xp: number;
  streakDays: number;
  languageTarget: string;
  algebraProgress: number;
  linearProgress: number;
  quadraticProgress: number;
}
