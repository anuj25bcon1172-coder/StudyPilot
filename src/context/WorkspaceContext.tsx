import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import {
  User,
  browserLocalPersistence,
  getRedirectResult,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
  testConnection,
} from '../lib/firebase';
import {
  Assignment,
  AssignmentAttachment,
  AssignmentStatus,
  Goal,
  RevisionItem,
  RevisionToolType,
  SavedSolution,
  SolvedAssignment,
  SolvedAssignmentSolution,
  StudentProfile,
  TimelineEvent,
  ViewId,
} from '../types';

const LEGACY_STORAGE_KEY = 'sturio_workspace_v1';

const EMPTY_PROFILE: StudentProfile = {
  uid: '',
  displayName: 'Student',
  level: 1,
  xp: 0,
  streakDays: 0,
  languageTarget: 'Academic English & French',
  algebraProgress: 0,
  linearProgress: 0,
  quadraticProgress: 0,
};

function formatAuthError(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code || '')
      : '';
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'this domain';

  switch (code) {
    case 'auth/unauthorized-domain':
      return `Google Sign-In is blocked on "${hostname}". Add "${hostname}" in Firebase Console → Authentication → Settings → Authorized domains.`;
    case 'auth/popup-blocked':
      return 'Sign-in popup was blocked by your browser. Please allow popups for this site or try again.';
    case 'auth/popup-closed-by-user':
      return 'Google Sign-In window was closed before completing sign-in. Please try again.';
    case 'auth/cancelled-popup-request':
      return 'Another sign-in window is already open. Complete the active Google prompt or try again.';
    case 'auth/network-request-failed':
      return 'Network error while contacting Google Authentication. Check your internet connection and retry.';
    case 'auth/account-exists-with-different-credential':
      return 'An account already exists with this email under a different sign-in provider.';
    case 'auth/operation-not-allowed':
      return 'Google Sign-In is not enabled in Firebase Authentication for this project.';
    default:
      if (err instanceof Error && err.message.trim()) {
        return err.message;
      }
      return 'Unable to sign in with Google right now. Please try again.';
  }
}

interface WorkspaceContextValue {
  user: User | null;
  authLoading: boolean;
  syncError: string | null;
  clearSyncError: () => void;
  signInWithGoogle: () => Promise<boolean>;
  signOutUser: () => Promise<void>;
  activeView: ViewId;
  setActiveView: (view: ViewId) => void;
  revisionInitialTool: RevisionToolType;
  setRevisionInitialTool: (tool: RevisionToolType) => void;
  revisionInitialTab: 'tools' | 'folder';
  setRevisionInitialTab: (tab: 'tools' | 'folder') => void;
  isAddAssignmentOpen: boolean;
  setIsAddAssignmentOpen: (open: boolean) => void;
  selectedSolvedAssignment: SolvedAssignment | null;
  setSelectedSolvedAssignment: (item: SolvedAssignment | null) => void;
  pendingSolverPrompt: { question: string; subject: string } | null;
  setPendingSolverPrompt: (prompt: { question: string; subject: string } | null) => void;
  profile: StudentProfile;
  assignments: Assignment[];
  goals: Goal[];
  timelineEvents: TimelineEvent[];
  savedSolutions: SavedSolution[];
  solvedAssignments: SolvedAssignment[];
  revisionItems: RevisionItem[];
  addAssignment: (input: {
    title: string;
    subject: string;
    dueDate: string;
    status: AssignmentStatus;
    questionText?: string;
    questionFile?: AssignmentAttachment | null;
    handwrittenSolution?: AssignmentAttachment | null;
    linkedSolvedAssignmentId?: string | null;
  }) => Promise<void>;
  updateAssignmentDetails: (
    id: string,
    updates: {
      title?: string;
      subject?: string;
      dueDate?: string;
      status?: AssignmentStatus;
      questionText?: string;
      questionFile?: AssignmentAttachment | null;
      handwrittenSolution?: AssignmentAttachment | null;
      linkedSolvedAssignmentId?: string | null;
    }
  ) => Promise<void>;
  updateAssignmentStatus: (id: string, status: AssignmentStatus) => Promise<void>;
  deleteAssignment: (id: string) => Promise<void>;
  addGoal: (title: string) => Promise<void>;
  toggleGoal: (id: string) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
  addTimelineEvent: (input: { title: string; time: string; date: string; colorTheme: 'rose' | 'emerald' | 'purple' }) => Promise<void>;
  deleteTimelineEvent: (id: string) => Promise<void>;
  saveSolution: (sol: Omit<SavedSolution, 'id' | 'userId' | 'createdAt'>) => Promise<void>;
  deleteSolution: (id: string) => Promise<void>;
  saveSolvedAssignment: (input: {
    assignmentName: string;
    subject: string;
    question: string;
    solution: SolvedAssignmentSolution;
  }) => Promise<SolvedAssignment>;
  deleteSolvedAssignment: (id: string) => Promise<void>;
  saveRevisionItem: (item: Omit<RevisionItem, 'id' | 'userId' | 'createdAt'>) => Promise<void>;
  deleteRevisionItem: (id: string) => Promise<void>;
  awardXp: (amount: number) => Promise<void>;
  clearPracticeHistory: () => Promise<void>;
}

const VIEW_PATHS: Record<ViewId, string> = {
  home: '/',
  dashboard: '/dashboard',
  assignments: '/assignments',
  solver: '/solver',
  assistant: '/tutor',
  revision: '/revision',
};

function getViewFromPath(pathname: string): ViewId {
  const clean = pathname.replace(/\/+$/, '') || '/';
  if (clean === '/dashboard') return 'dashboard';
  if (clean === '/assignments') return 'assignments';
  if (clean === '/solver') return 'solver';
  if (clean === '/tutor' || clean === '/assistant') return 'assistant';
  if (clean === '/revision') return 'revision';
  return 'home';
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [syncError, setSyncError] = useState<string | null>(null);
  const clearSyncError = useCallback(() => setSyncError(null), []);

  const [activeView, setActiveViewState] = useState<ViewId>(() =>
    typeof window !== 'undefined' ? getViewFromPath(window.location.pathname) : 'home'
  );

  const setActiveView = useCallback((view: ViewId) => {
    setActiveViewState(view);
    if (typeof window !== 'undefined') {
      const targetPath = VIEW_PATHS[view];
      if (window.location.pathname !== targetPath) {
        window.history.pushState({ view }, '', targetPath);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const VIEW_TITLES: Record<ViewId, string> = {
    home: 'StudyPilot — Smart Assignment Hub',
    dashboard: 'StudyPilot — Dashboard',
    assignments: 'StudyPilot — Assignment Manager',
    solver: 'StudyPilot — AI Assignment Solver',
    assistant: 'StudyPilot — AI Learning Assistant',
    revision: 'StudyPilot — Quick Revision Centre',
  };

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = VIEW_TITLES[activeView];
    }
  }, [activeView]);

  useEffect(() => {
    const onPopState = () => {
      setActiveViewState(getViewFromPath(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const [revisionInitialTool, setRevisionInitialTool] = useState<RevisionToolType>('notes');
  const [revisionInitialTab, setRevisionInitialTab] = useState<'tools' | 'folder'>('tools');
  const [isAddAssignmentOpen, setIsAddAssignmentOpen] = useState(false);
  const [selectedSolvedAssignment, setSelectedSolvedAssignment] = useState<SolvedAssignment | null>(null);
  const [pendingSolverPrompt, setPendingSolverPrompt] = useState<{
    question: string;
    subject: string;
  } | null>(null);

  const [profile, setProfile] = useState<StudentProfile>(EMPTY_PROFILE);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [savedSolutions, setSavedSolutions] = useState<SavedSolution[]>([]);
  const [solvedAssignments, setSolvedAssignments] = useState<SolvedAssignment[]>([]);
  const [revisionItems, setRevisionItems] = useState<RevisionItem[]>([]);

  // Clear legacy unauthenticated local cache so zero dummy data persists across sessions
  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // Ignore storage access errors
    }
  }, []);

  const seedingUidsRef = useRef<Set<string>>(new Set());

  // Initialize empty profile document in Firestore for newly authenticated users
  const seedUserWorkspace = useCallback(async (uid: string, displayName: string) => {
    const profileRef = doc(db, 'users', uid);
    try {
      await setDoc(profileRef, {
        uid,
        displayName: displayName.slice(0, 80) || 'Student',
        level: 1,
        xp: 0,
        streakDays: 0,
        languageTarget: 'Academic English & French',
        algebraProgress: 0,
        linearProgress: 0,
        quadraticProgress: 0,
        updatedAt: serverTimestamp(),
      });
      setSyncError(null);
    } catch (error) {
      seedingUidsRef.current.delete(uid);
      setSyncError(error instanceof Error ? error.message : 'Unable to initialize cloud profile.');
      handleFirestoreError(error, OperationType.WRITE, `users/${uid}`);
    }
  }, []);

  // Auth listener + redirect completion + Firestore live subscriptions
  useEffect(() => {
    void testConnection();
    void setPersistence(auth, browserLocalPersistence).catch(() => undefined);
    void getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          setUser(result.user);
          setSyncError(null);
        }
      })
      .catch((err) => {
        setSyncError(formatAuthError(err));
      });

    let unsubProfile: (() => void) | undefined;
    let unsubAssignments: (() => void) | undefined;
    let unsubGoals: (() => void) | undefined;
    let unsubTimeline: (() => void) | undefined;
    let unsubSolutions: (() => void) | undefined;
    let unsubSolvedAssignments: (() => void) | undefined;
    let unsubRevision: (() => void) | undefined;

    const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
      unsubProfile?.();
      unsubAssignments?.();
      unsubGoals?.();
      unsubTimeline?.();
      unsubSolutions?.();
      unsubSolvedAssignments?.();
      unsubRevision?.();

      // Always reset in-memory collections cleanly on auth changes so no stale data leaks
      setAssignments([]);
      setGoals([]);
      setTimelineEvents([]);
      setSavedSolutions([]);
      setSolvedAssignments([]);
      setRevisionItems([]);

      setUser(firebaseUser);
      setAuthLoading(false);

      if (!firebaseUser) {
        setProfile(EMPTY_PROFILE);
        return;
      }

      setSyncError(null);
      const uid = firebaseUser.uid;
      setProfile({
        ...EMPTY_PROFILE,
        uid,
        displayName: firebaseUser.displayName || 'Student',
      });

      unsubProfile = onSnapshot(
        doc(db, 'users', uid),
        { includeMetadataChanges: true },
        (snap) => {
          if (snap.exists()) {
            const d = snap.data();
            setSyncError(null);
            setProfile({
              uid: d.uid,
              displayName: d.displayName,
              level: d.level,
              xp: d.xp,
              streakDays: d.streakDays,
              languageTarget: d.languageTarget,
              algebraProgress: d.algebraProgress,
              linearProgress: d.linearProgress,
              quadraticProgress: d.quadraticProgress,
            });
          } else if (!snap.metadata.fromCache && !seedingUidsRef.current.has(uid)) {
            seedingUidsRef.current.add(uid);
            void seedUserWorkspace(uid, firebaseUser.displayName || 'Student');
          }
        },
        (error) => {
          setSyncError(error.message);
          handleFirestoreError(error, OperationType.GET, `users/${uid}`);
        }
      );

      unsubAssignments = onSnapshot(
        query(collection(db, 'users', uid, 'assignments'), where('userId', '==', uid)),
        (snap) => {
          const items = snap.docs.map((docSnap) => {
            const d = docSnap.data();
            return {
              id: docSnap.id,
              userId: d.userId,
              title: d.title,
              subject: d.subject,
              dueDate: d.dueDate,
              status: d.status,
              questionText: typeof d.questionText === 'string' ? d.questionText : undefined,
              questionFile: d.questionFile ?? null,
              handwrittenSolution: d.handwrittenSolution ?? null,
              linkedSolvedAssignmentId:
                typeof d.linkedSolvedAssignmentId === 'string'
                  ? d.linkedSolvedAssignmentId
                  : null,
            } as Assignment;
          });
          items.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
          setAssignments(items);
        },
        (error) => handleFirestoreError(error, OperationType.LIST, `users/${uid}/assignments`)
      );

      unsubGoals = onSnapshot(
        query(collection(db, 'users', uid, 'goals'), where('userId', '==', uid)),
        (snap) => {
          const items = snap.docs
            .map((docSnap) => {
              const d = docSnap.data();
              const ms = typeof d.createdAt?.toMillis === 'function' ? d.createdAt.toMillis() : 0;
              return {
                id: docSnap.id,
                userId: d.userId,
                title: d.title,
                completed: Boolean(d.completed),
                _ms: ms,
              };
            })
            .sort((a, b) => a._ms - b._ms)
            .map(({ _ms: _, ...rest }) => rest as Goal);
          setGoals(items);
        },
        (error) => handleFirestoreError(error, OperationType.LIST, `users/${uid}/goals`)
      );

      unsubTimeline = onSnapshot(
        query(collection(db, 'users', uid, 'timelineEvents'), where('userId', '==', uid)),
        (snap) => {
          const items = snap.docs.map((docSnap) => {
            const d = docSnap.data();
            return {
              id: docSnap.id,
              userId: d.userId,
              title: d.title,
              time: d.time,
              date: d.date,
              colorTheme: d.colorTheme,
            } as TimelineEvent;
          });
          items.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
          setTimelineEvents(items);
        },
        (error) => handleFirestoreError(error, OperationType.LIST, `users/${uid}/timelineEvents`)
      );

      unsubSolutions = onSnapshot(
        query(collection(db, 'users', uid, 'savedSolutions'), where('userId', '==', uid)),
        (snap) => {
          const items = snap.docs
            .map((docSnap) => {
              const d = docSnap.data();
              const ms = typeof d.createdAt?.toMillis === 'function' ? d.createdAt.toMillis() : 0;
              return {
                id: docSnap.id,
                userId: d.userId,
                question: d.question,
                subject: d.subject,
                finalAnswer: d.finalAnswer,
                steps: Array.isArray(d.steps) ? d.steps : [],
                _ms: ms,
              };
            })
            .sort((a, b) => b._ms - a._ms)
            .map(({ _ms: _, ...rest }) => rest as SavedSolution);
          setSavedSolutions(items);
        },
        (error) => handleFirestoreError(error, OperationType.LIST, `users/${uid}/savedSolutions`)
      );

      unsubRevision = onSnapshot(
        query(collection(db, 'users', uid, 'revisionItems'), where('userId', '==', uid)),
        (snap) => {
          const items = snap.docs
            .map((docSnap) => {
              const d = docSnap.data();
              const ms = typeof d.createdAt?.toMillis === 'function' ? d.createdAt.toMillis() : 0;
              return {
                id: docSnap.id,
                userId: d.userId,
                toolType: d.toolType,
                topic: d.topic,
                summaryText: d.summaryText,
                items: Array.isArray(d.items) ? d.items : [],
                _ms: ms,
              };
            })
            .sort((a, b) => b._ms - a._ms)
            .map(({ _ms: _, ...rest }) => rest as RevisionItem);
          setRevisionItems(items);
        },
        (error) => handleFirestoreError(error, OperationType.LIST, `users/${uid}/revisionItems`)
      );

      unsubSolvedAssignments = onSnapshot(
        query(collection(db, 'users', uid, 'solvedAssignments'), where('userId', '==', uid)),
        (snap) => {
          const items = snap.docs
            .map((docSnap) => {
              const d = docSnap.data();
              const ms = typeof d.createdAt?.toMillis === 'function' ? d.createdAt.toMillis() : 0;
              const iso =
                typeof d.createdAt?.toDate === 'function'
                  ? d.createdAt.toDate().toISOString()
                  : undefined;
              const sol = (d.solution && typeof d.solution === 'object' ? d.solution : {}) as Record<
                string,
                unknown
              >;
              return {
                id: docSnap.id,
                userId: d.userId,
                assignmentName: d.assignmentName,
                subject: d.subject,
                question: d.question,
                solution: {
                  title: typeof sol.title === 'string' ? sol.title : undefined,
                  finalAnswer: typeof sol.finalAnswer === 'string' ? sol.finalAnswer : '',
                  steps: Array.isArray(sol.steps) ? sol.steps : [],
                },
                createdAt: iso,
                _ms: ms,
              };
            })
            .sort((a, b) => b._ms - a._ms)
            .map(({ _ms: _, ...rest }) => rest as SolvedAssignment);
          setSolvedAssignments(items);
        },
        (error) => handleFirestoreError(error, OperationType.LIST, `users/${uid}/solvedAssignments`)
      );
    });

    return () => {
      unsubAuth();
      unsubProfile?.();
      unsubAssignments?.();
      unsubGoals?.();
      unsubTimeline?.();
      unsubSolutions?.();
      unsubSolvedAssignments?.();
      unsubRevision?.();
    };
  }, [seedUserWorkspace]);

  const signInWithGoogle = async (): Promise<boolean> => {
    setSyncError(null);
    try {
      const credential = await signInWithPopup(auth, googleProvider);
      if (credential.user) {
        setUser(credential.user);
      }
      return true;
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code || '')
          : '';
      if (
        code === 'auth/popup-blocked' ||
        code === 'auth/operation-not-supported-in-this-environment'
      ) {
        try {
          await signInWithRedirect(auth, googleProvider);
          return true;
        } catch (redirectErr) {
          setSyncError(formatAuthError(redirectErr));
          return false;
        }
      }
      setSyncError(formatAuthError(err));
      return false;
    }
  };

  const signOutUser = async () => {
    setSyncError(null);
    await signOut(auth);
  };

  const awardXp = async (amount: number) => {
    const cleanAmount = Math.max(0, Math.round(amount));
    if (cleanAmount === 0) return;

    const totalXp = profile.xp + cleanAmount;
    const extraLevels = Math.floor(totalXp / 500);
    const nextLevel = profile.level + extraLevels;
    const nextXp = totalXp >= 500 ? totalXp % 500 : totalXp;

    if (!user) {
      setProfile((prev) => ({ ...prev, xp: nextXp, level: nextLevel }));
      return;
    }

    const path = `users/${user.uid}`;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        xp: nextXp,
        level: nextLevel,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const addAssignment = async (input: {
    title: string;
    subject: string;
    dueDate: string;
    status: AssignmentStatus;
    questionText?: string;
    questionFile?: AssignmentAttachment | null;
    handwrittenSolution?: AssignmentAttachment | null;
    linkedSolvedAssignmentId?: string | null;
  }) => {
    const id = `assign_${Date.now()}`;
    const cleanTitle = input.title.trim().slice(0, 160);
    const cleanSubject = input.subject.trim().slice(0, 80);
    const cleanQuestionText = (input.questionText || '').trim().slice(0, 6000);

    const newItem: Assignment = {
      id,
      userId: user ? user.uid : 'local-student',
      title: cleanTitle,
      subject: cleanSubject,
      dueDate: input.dueDate,
      status: input.status,
      ...(cleanQuestionText ? { questionText: cleanQuestionText } : {}),
      ...(input.questionFile ? { questionFile: input.questionFile } : {}),
      ...(input.handwrittenSolution ? { handwrittenSolution: input.handwrittenSolution } : {}),
      ...(input.linkedSolvedAssignmentId
        ? { linkedSolvedAssignmentId: input.linkedSolvedAssignmentId }
        : {}),
    };

    if (!user) {
      setAssignments((prev) => [newItem, ...prev]);
      return;
    }

    const path = `users/${user.uid}/assignments/${id}`;
    const payload: Record<string, unknown> = {
      userId: user.uid,
      title: cleanTitle,
      subject: cleanSubject,
      dueDate: input.dueDate,
      status: input.status,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (cleanQuestionText) payload.questionText = cleanQuestionText;
    if (input.questionFile) payload.questionFile = input.questionFile;
    if (input.handwrittenSolution) payload.handwrittenSolution = input.handwrittenSolution;
    if (input.linkedSolvedAssignmentId) {
      payload.linkedSolvedAssignmentId = input.linkedSolvedAssignmentId;
    }

    try {
      await setDoc(doc(db, 'users', user.uid, 'assignments', id), payload);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const updateAssignmentDetails = async (
    id: string,
    updates: {
      title?: string;
      subject?: string;
      dueDate?: string;
      status?: AssignmentStatus;
      questionText?: string;
      questionFile?: AssignmentAttachment | null;
      handwrittenSolution?: AssignmentAttachment | null;
      linkedSolvedAssignmentId?: string | null;
    }
  ) => {
    const existing = assignments.find((a) => a.id === id);
    if (!existing) return;

    const cleanQuestionText =
      updates.questionText !== undefined ? updates.questionText.trim().slice(0, 6000) : undefined;

    if (!user) {
      setAssignments((prev) =>
        prev.map((a) => {
          if (a.id !== id) return a;
          const next: Assignment = { ...a };
          if (existing.status !== 'Completed') {
            if (updates.title !== undefined) next.title = updates.title.trim().slice(0, 160) || a.title;
            if (updates.subject !== undefined)
              next.subject = updates.subject.trim().slice(0, 80) || a.subject;
            if (updates.dueDate !== undefined) next.dueDate = updates.dueDate;
            if (updates.status !== undefined) next.status = updates.status;
          }
          if (cleanQuestionText !== undefined) next.questionText = cleanQuestionText;
          if (updates.questionFile !== undefined) next.questionFile = updates.questionFile;
          if (updates.handwrittenSolution !== undefined) {
            next.handwrittenSolution = updates.handwrittenSolution;
          }
          if (updates.linkedSolvedAssignmentId !== undefined) {
            next.linkedSolvedAssignmentId = updates.linkedSolvedAssignmentId;
          }
          return next;
        })
      );
      if (existing.status !== 'Completed' && updates.status === 'Completed') {
        await awardXp(15);
      }
      return;
    }

    const path = `users/${user.uid}/assignments/${id}`;
    const payload: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };

    const canEditCore = existing.status !== 'Completed';
    if (canEditCore) {
      if (updates.title !== undefined) payload.title = updates.title.trim().slice(0, 160) || existing.title;
      if (updates.subject !== undefined)
        payload.subject = updates.subject.trim().slice(0, 80) || existing.subject;
      if (updates.dueDate !== undefined) payload.dueDate = updates.dueDate;
      if (updates.status !== undefined) payload.status = updates.status;
    }

    if (cleanQuestionText !== undefined) {
      payload.questionText = cleanQuestionText ? cleanQuestionText : deleteField();
    }
    if (updates.questionFile !== undefined) {
      payload.questionFile = updates.questionFile ? updates.questionFile : deleteField();
    }
    if (updates.handwrittenSolution !== undefined) {
      payload.handwrittenSolution = updates.handwrittenSolution
        ? updates.handwrittenSolution
        : deleteField();
    }
    if (updates.linkedSolvedAssignmentId !== undefined) {
      payload.linkedSolvedAssignmentId = updates.linkedSolvedAssignmentId
        ? updates.linkedSolvedAssignmentId
        : deleteField();
    }

    try {
      await updateDoc(doc(db, 'users', user.uid, 'assignments', id), payload);
      if (canEditCore && updates.status === 'Completed') {
        await awardXp(15);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const updateAssignmentStatus = async (id: string, status: AssignmentStatus) => {
    const existing = assignments.find((a) => a.id === id);
    if (!existing || existing.status === 'Completed') return;

    if (!user) {
      setAssignments((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
      if (status === 'Completed') {
        await awardXp(15);
      }
      return;
    }

    const path = `users/${user.uid}/assignments/${id}`;
    try {
      await updateDoc(doc(db, 'users', user.uid, 'assignments', id), {
        status,
        updatedAt: serverTimestamp(),
      });
      if (status === 'Completed') {
        await awardXp(15);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const deleteAssignment = async (id: string) => {
    if (!user) {
      setAssignments((prev) => prev.filter((a) => a.id !== id));
      return;
    }
    const path = `users/${user.uid}/assignments/${id}`;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'assignments', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const addGoal = async (title: string) => {
    const clean = title.trim().slice(0, 160);
    if (!clean) return;
    const id = `goal_${Date.now()}`;

    if (!user) {
      setGoals((prev) => [...prev, { id, userId: 'local-student', title: clean, completed: false }]);
      return;
    }

    const path = `users/${user.uid}/goals/${id}`;
    try {
      await setDoc(doc(db, 'users', user.uid, 'goals', id), {
        userId: user.uid,
        title: clean,
        completed: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const toggleGoal = async (id: string) => {
    const target = goals.find((g) => g.id === id);
    if (!target) return;
    const nextCompleted = !target.completed;

    if (!user) {
      setGoals((prev) => prev.map((g) => (g.id === id ? { ...g, completed: nextCompleted } : g)));
      return;
    }

    const path = `users/${user.uid}/goals/${id}`;
    try {
      await updateDoc(doc(db, 'users', user.uid, 'goals', id), {
        completed: nextCompleted,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const deleteGoal = async (id: string) => {
    if (!user) {
      setGoals((prev) => prev.filter((g) => g.id !== id));
      return;
    }
    const path = `users/${user.uid}/goals/${id}`;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'goals', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const addTimelineEvent = async (input: {
    title: string;
    time: string;
    date: string;
    colorTheme: 'rose' | 'emerald' | 'purple';
  }) => {
    const id = `evt_${Date.now()}`;
    const cleanTitle = input.title.trim().slice(0, 120);
    const cleanTime = input.time.trim().slice(0, 20);
    if (!cleanTitle) return;

    if (!user) {
      setTimelineEvents((prev) => [
        ...prev,
        { id, userId: 'local-student', title: cleanTitle, time: cleanTime, date: input.date, colorTheme: input.colorTheme },
      ]);
      return;
    }

    const path = `users/${user.uid}/timelineEvents/${id}`;
    try {
      await setDoc(doc(db, 'users', user.uid, 'timelineEvents', id), {
        userId: user.uid,
        title: cleanTitle,
        time: cleanTime,
        date: input.date,
        colorTheme: input.colorTheme,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const deleteTimelineEvent = async (id: string) => {
    if (!user) {
      setTimelineEvents((prev) => prev.filter((e) => e.id !== id));
      return;
    }
    const path = `users/${user.uid}/timelineEvents/${id}`;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'timelineEvents', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const saveSolution = async (sol: Omit<SavedSolution, 'id' | 'userId' | 'createdAt'>) => {
    const id = `sol_${Date.now()}`;
    const cleanQuestion = sol.question.trim().slice(0, 4000);
    const cleanSubject = sol.subject.trim().slice(0, 60) || 'General';
    const cleanFinal = sol.finalAnswer.trim().slice(0, 2000) || 'Solved';
    const cleanSteps = sol.steps.slice(0, 15);

    if (!user) {
      setSavedSolutions((prev) => [
        {
          id,
          userId: 'local-student',
          question: cleanQuestion,
          subject: cleanSubject,
          title: sol.title,
          finalAnswer: cleanFinal,
          steps: cleanSteps,
        },
        ...prev,
      ]);
      return;
    }

    const path = `users/${user.uid}/savedSolutions/${id}`;
    try {
      await setDoc(doc(db, 'users', user.uid, 'savedSolutions', id), {
        userId: user.uid,
        question: cleanQuestion,
        subject: cleanSubject,
        finalAnswer: cleanFinal,
        steps: cleanSteps,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const deleteSolution = async (id: string) => {
    if (!user) {
      setSavedSolutions((prev) => prev.filter((s) => s.id !== id));
      return;
    }
    const path = `users/${user.uid}/savedSolutions/${id}`;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'savedSolutions', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const saveRevisionItem = async (item: Omit<RevisionItem, 'id' | 'userId' | 'createdAt'>) => {
    const id = `rev_${Date.now()}`;
    const cleanTopic = item.topic.trim().slice(0, 160) || 'Study Revision';
    const cleanSummary = item.summaryText.trim().slice(0, 12000) || 'Generated revision material';
    const cleanItems = item.items.slice(0, 30);

    if (!user) {
      setRevisionItems((prev) => [
        {
          id,
          userId: 'local-student',
          toolType: item.toolType,
          topic: cleanTopic,
          summaryText: cleanSummary,
          items: cleanItems,
        },
        ...prev,
      ]);
      return;
    }

    const path = `users/${user.uid}/revisionItems/${id}`;
    try {
      await setDoc(doc(db, 'users', user.uid, 'revisionItems', id), {
        userId: user.uid,
        toolType: item.toolType,
        topic: cleanTopic,
        summaryText: cleanSummary,
        items: cleanItems,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const deleteRevisionItem = async (id: string) => {
    if (!user) {
      setRevisionItems((prev) => prev.filter((r) => r.id !== id));
      return;
    }
    const path = `users/${user.uid}/revisionItems/${id}`;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'revisionItems', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const saveSolvedAssignment = async (input: {
    assignmentName: string;
    subject: string;
    question: string;
    solution: SolvedAssignmentSolution;
  }): Promise<SolvedAssignment> => {
    const id = `solved_${Date.now()}`;
    const cleanAssignmentName = input.assignmentName.trim().slice(0, 160);
    if (!cleanAssignmentName) {
      throw new Error('Please enter an Assignment Name before saving.');
    }
    const cleanSubject = input.subject.trim().slice(0, 80) || 'General';
    const cleanQuestion = input.question.trim().slice(0, 4000) || 'Problem';
    const cleanFinalAnswer = input.solution.finalAnswer.trim().slice(0, 2000) || 'Solved';
    const cleanTitle = input.solution.title ? input.solution.title.trim().slice(0, 200) : '';
    const normalizedSteps = input.solution.steps.slice(0, 15).map((step, idx) => ({
      stepNumber: Number(step.stepNumber) || idx + 1,
      title: String(step.title || `Step ${idx + 1}`).slice(0, 200),
      explanation: String(step.explanation || '').slice(0, 4000),
      formula: String(step.formula || '').slice(0, 2000),
    }));
    const safeSteps =
      normalizedSteps.length > 0
        ? normalizedSteps
        : [
            {
              stepNumber: 1,
              title: 'Solution Summary',
              explanation: cleanFinalAnswer,
              formula: '',
            },
          ];

    const solutionPayload: SolvedAssignmentSolution = cleanTitle
      ? { title: cleanTitle, finalAnswer: cleanFinalAnswer, steps: safeSteps }
      : { finalAnswer: cleanFinalAnswer, steps: safeSteps };

    const createdItem: SolvedAssignment = {
      id,
      userId: user ? user.uid : 'local-student',
      assignmentName: cleanAssignmentName,
      subject: cleanSubject,
      question: cleanQuestion,
      solution: solutionPayload,
      createdAt: new Date().toISOString(),
    };

    if (!user) {
      setSolvedAssignments((prev) => [createdItem, ...prev]);
      return createdItem;
    }

    const path = `users/${user.uid}/solvedAssignments/${id}`;
    try {
      await setDoc(doc(db, 'users', user.uid, 'solvedAssignments', id), {
        userId: user.uid,
        assignmentName: cleanAssignmentName,
        subject: cleanSubject,
        question: cleanQuestion,
        solution: solutionPayload,
        createdAt: serverTimestamp(),
      });
      return createdItem;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const deleteSolvedAssignment = async (id: string) => {
    if (!user) {
      setSolvedAssignments((prev) => prev.filter((s) => s.id !== id));
      return;
    }
    const path = `users/${user.uid}/solvedAssignments/${id}`;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'solvedAssignments', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const clearPracticeHistory = async () => {
    if (!user) {
      setSavedSolutions([]);
      setRevisionItems([]);
      return;
    }
    const batch = writeBatch(db);
    savedSolutions.forEach((s) => batch.delete(doc(db, 'users', user.uid, 'savedSolutions', s.id)));
    revisionItems.forEach((r) => batch.delete(doc(db, 'users', user.uid, 'revisionItems', r.id)));
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/history`);
    }
  };

  return (
    <WorkspaceContext.Provider
      value={{
        user,
        authLoading,
        syncError,
        clearSyncError,
        signInWithGoogle,
        signOutUser,
        activeView,
        setActiveView,
        revisionInitialTool,
        setRevisionInitialTool,
        revisionInitialTab,
        setRevisionInitialTab,
        isAddAssignmentOpen,
        setIsAddAssignmentOpen,
        selectedSolvedAssignment,
        setSelectedSolvedAssignment,
        pendingSolverPrompt,
        setPendingSolverPrompt,
        profile,
        assignments,
        goals,
        timelineEvents,
        savedSolutions,
        solvedAssignments,
        revisionItems,
        addAssignment,
        updateAssignmentDetails,
        updateAssignmentStatus,
        deleteAssignment,
        addGoal,
        toggleGoal,
        deleteGoal,
        addTimelineEvent,
        deleteTimelineEvent,
        saveSolution,
        deleteSolution,
        saveSolvedAssignment,
        deleteSolvedAssignment,
        saveRevisionItem,
        deleteRevisionItem,
        awardXp,
        clearPracticeHistory,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return ctx;
}
