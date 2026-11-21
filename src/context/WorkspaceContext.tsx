import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
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
  AssignmentStatus,
  Goal,
  RevisionItem,
  RevisionToolType,
  SavedSolution,
  StudentProfile,
  TimelineEvent,
  ViewId,
} from '../types';

const STORAGE_KEY = 'sturio_workspace_v1';

const DEFAULT_PROFILE: StudentProfile = {
  uid: 'local-student',
  displayName: 'Shuvo',
  level: 20,
  xp: 150,
  streakDays: 2,
  languageTarget: 'Academic English & French',
  algebraProgress: 76,
  linearProgress: 75,
  quadraticProgress: 25,
};

function getTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getRelativeIso(offsetDays: number): string {
  const dt = new Date();
  dt.setDate(dt.getDate() + offsetDays);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const DEFAULT_ASSIGNMENTS: Assignment[] = [
  {
    id: 'assign-1',
    userId: 'local-student',
    title: 'Math Problem Set — Differential Equations',
    subject: 'Mathematics',
    dueDate: getRelativeIso(1),
    status: 'Pending',
  },
  {
    id: 'assign-2',
    userId: 'local-student',
    title: 'Physics Lab Report — Wave Optics',
    subject: 'Physics',
    dueDate: getRelativeIso(2),
    status: 'Pending',
  },
  {
    id: 'assign-3',
    userId: 'local-student',
    title: 'History Essay — Industrial Policy',
    subject: 'History',
    dueDate: getRelativeIso(-1),
    status: 'Completed',
  },
  {
    id: 'assign-4',
    userId: 'local-student',
    title: 'Chemistry Worksheet — Stoichiometry',
    subject: 'Chemistry',
    dueDate: getRelativeIso(-2),
    status: 'Completed',
  },
  {
    id: 'assign-5',
    userId: 'local-student',
    title: 'English Literature Analysis',
    subject: 'Literature',
    dueDate: getRelativeIso(-3),
    status: 'Overdue',
  },
  {
    id: 'assign-6',
    userId: 'local-student',
    title: 'Data Structures — Binary Search Trees',
    subject: 'Computer Science',
    dueDate: getRelativeIso(3),
    status: 'Pending',
  },
  {
    id: 'assign-7',
    userId: 'local-student',
    title: 'Linear Algebra Eigenvalues Quiz Prep',
    subject: 'Mathematics',
    dueDate: getRelativeIso(4),
    status: 'Pending',
  },
  {
    id: 'assign-8',
    userId: 'local-student',
    title: 'Microeconomics Elasticity Brief',
    subject: 'Economics',
    dueDate: getRelativeIso(-1),
    status: 'Completed',
  },
];

const DEFAULT_GOALS: Goal[] = [
  { id: 'goal-1', userId: 'local-student', title: 'Make Summary Note', completed: false },
  { id: 'goal-2', userId: 'local-student', title: 'Chemistry Quiz', completed: true },
  { id: 'goal-3', userId: 'local-student', title: 'English Learning', completed: false },
];

const DEFAULT_TIMELINE: TimelineEvent[] = [
  {
    id: 'evt-1',
    userId: 'local-student',
    title: 'Study Group Meeting',
    time: '15:30',
    date: getTodayIso(),
    colorTheme: 'rose',
  },
  {
    id: 'evt-2',
    userId: 'local-student',
    title: 'Calculus Practice Review',
    time: '19:30',
    date: getTodayIso(),
    colorTheme: 'emerald',
  },
];

const DEFAULT_SOLUTIONS: SavedSolution[] = [
  {
    id: 'sol-1',
    userId: 'local-student',
    question: 'Solve the differential equation dy/dx + 2y = x with the initial condition y(0) = 1.',
    subject: 'Differential Equations',
    title: 'First-Order Linear ODE with Integrating Factor',
    steps: [
      {
        stepNumber: 1,
        title: 'Find the integrating factor',
        explanation: 'The equation is in standard linear form $\\frac{dy}{dx} + P(x)y = Q(x)$ where $P(x) = 2$ and $Q(x) = x$.',
        formula: 'IF = e^{\\int P(x)\\,dx} = e^{\\int 2\\,dx} = e^{2x}',
      },
      {
        stepNumber: 2,
        title: 'Multiply through by the integrating factor',
        explanation: 'Multiplying both sides by $e^{2x}$ turns the left-hand side into an exact product derivative.',
        formula: '\\frac{d}{dx}\\left(y e^{2x}\\right) = x e^{2x}',
      },
      {
        stepNumber: 3,
        title: 'Integrate both sides and apply initial condition',
        explanation: 'Using integration by parts on $\\int x e^{2x}\\,dx$ gives $\\frac{x}{2}e^{2x} - \\frac{1}{4}e^{2x} + C$. Applying $y(0) = 1$ yields $C = \\frac{5}{4}$.',
        formula: 'y(x) = \\frac{x}{2} - \\frac{1}{4} + \\frac{5}{4}e^{-2x}',
      },
    ],
    finalAnswer: '$y(x) = \\frac{x}{2} - \\frac{1}{4} + \\frac{5}{4}e^{-2x}$',
  },
];

const DEFAULT_REVISION: RevisionItem[] = [
  {
    id: 'rev-1',
    userId: 'local-student',
    toolType: 'notes',
    topic: 'Pythagorean Theorem & Right Triangles',
    summaryText: 'Core relationship between legs and hypotenuse of any Euclidean right-angled triangle.',
    items: [
      {
        heading: 'Fundamental Identity',
        points: ['In a right triangle, the square of the hypotenuse equals the sum of the squares of the two legs: a^2 + b^2 = c^2.'],
      },
    ],
  },
];

interface LocalStore {
  profile: StudentProfile;
  assignments: Assignment[];
  goals: Goal[];
  timelineEvents: TimelineEvent[];
  savedSolutions: SavedSolution[];
  revisionItems: RevisionItem[];
}

function loadLocalStore(): LocalStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        profile: { ...DEFAULT_PROFILE, ...(parsed.profile || {}) },
        assignments: Array.isArray(parsed.assignments) ? parsed.assignments : DEFAULT_ASSIGNMENTS,
        goals: Array.isArray(parsed.goals) ? parsed.goals : DEFAULT_GOALS,
        timelineEvents: Array.isArray(parsed.timelineEvents) ? parsed.timelineEvents : DEFAULT_TIMELINE,
        savedSolutions: Array.isArray(parsed.savedSolutions) ? parsed.savedSolutions : DEFAULT_SOLUTIONS,
        revisionItems: Array.isArray(parsed.revisionItems) ? parsed.revisionItems : DEFAULT_REVISION,
      };
    }
  } catch {
    // Fallback to defaults
  }
  return {
    profile: DEFAULT_PROFILE,
    assignments: DEFAULT_ASSIGNMENTS,
    goals: DEFAULT_GOALS,
    timelineEvents: DEFAULT_TIMELINE,
    savedSolutions: DEFAULT_SOLUTIONS,
    revisionItems: DEFAULT_REVISION,
  };
}

interface WorkspaceContextValue {
  user: User | null;
  authLoading: boolean;
  syncError: string | null;
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
  profile: StudentProfile;
  assignments: Assignment[];
  goals: Goal[];
  timelineEvents: TimelineEvent[];
  savedSolutions: SavedSolution[];
  revisionItems: RevisionItem[];
  addAssignment: (input: { title: string; subject: string; dueDate: string; status: AssignmentStatus }) => Promise<void>;
  updateAssignmentStatus: (id: string, status: AssignmentStatus) => Promise<void>;
  deleteAssignment: (id: string) => Promise<void>;
  addGoal: (title: string) => Promise<void>;
  toggleGoal: (id: string) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
  addTimelineEvent: (input: { title: string; time: string; date: string; colorTheme: 'rose' | 'emerald' | 'purple' }) => Promise<void>;
  deleteTimelineEvent: (id: string) => Promise<void>;
  saveSolution: (sol: Omit<SavedSolution, 'id' | 'userId' | 'createdAt'>) => Promise<void>;
  deleteSolution: (id: string) => Promise<void>;
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
  const initialLocal = loadLocalStore();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [syncError, setSyncError] = useState<string | null>(null);

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

  const [profile, setProfile] = useState<StudentProfile>(initialLocal.profile);
  const [assignments, setAssignments] = useState<Assignment[]>(initialLocal.assignments);
  const [goals, setGoals] = useState<Goal[]>(initialLocal.goals);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>(initialLocal.timelineEvents);
  const [savedSolutions, setSavedSolutions] = useState<SavedSolution[]>(initialLocal.savedSolutions);
  const [revisionItems, setRevisionItems] = useState<RevisionItem[]>(initialLocal.revisionItems);

  // Persist local state whenever unauthenticated
  useEffect(() => {
    if (!user) {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            profile,
            assignments,
            goals,
            timelineEvents,
            savedSolutions,
            revisionItems,
          })
        );
      } catch {
        // Ignore quota errors
      }
    }
  }, [user, profile, assignments, goals, timelineEvents, savedSolutions, revisionItems]);

  // Seed Firestore for newly authenticated users
  const ensureUserSeeded = useCallback(async (uid: string, displayName: string) => {
    const profileRef = doc(db, 'users', uid);
    try {
      const snap = await getDoc(profileRef);
      if (!snap.exists()) {
        const batch = writeBatch(db);
        batch.set(profileRef, {
          uid,
          displayName: displayName.slice(0, 80) || 'Student',
          level: 20,
          xp: 150,
          streakDays: 2,
          languageTarget: 'Academic English & French',
          algebraProgress: 76,
          linearProgress: 75,
          quadraticProgress: 25,
          updatedAt: serverTimestamp(),
        });

        DEFAULT_ASSIGNMENTS.forEach((a) => {
          batch.set(doc(db, 'users', uid, 'assignments', a.id), {
            userId: uid,
            title: a.title,
            subject: a.subject,
            dueDate: a.dueDate,
            status: a.status,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });

        DEFAULT_GOALS.forEach((g) => {
          batch.set(doc(db, 'users', uid, 'goals', g.id), {
            userId: uid,
            title: g.title,
            completed: g.completed,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });

        DEFAULT_TIMELINE.forEach((evt) => {
          batch.set(doc(db, 'users', uid, 'timelineEvents', evt.id), {
            userId: uid,
            title: evt.title,
            time: evt.time,
            date: evt.date,
            colorTheme: evt.colorTheme,
            createdAt: serverTimestamp(),
          });
        });

        DEFAULT_SOLUTIONS.forEach((sol) => {
          batch.set(doc(db, 'users', uid, 'savedSolutions', sol.id), {
            userId: uid,
            question: sol.question,
            subject: sol.subject,
            finalAnswer: sol.finalAnswer,
            steps: sol.steps,
            createdAt: serverTimestamp(),
          });
        });

        await batch.commit();
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${uid}`);
    }
  }, []);

  // Auth listener + Firestore live subscriptions
  useEffect(() => {
    void testConnection();
    let unsubProfile: (() => void) | undefined;
    let unsubAssignments: (() => void) | undefined;
    let unsubGoals: (() => void) | undefined;
    let unsubTimeline: (() => void) | undefined;
    let unsubSolutions: (() => void) | undefined;
    let unsubRevision: (() => void) | undefined;

    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);

      unsubProfile?.();
      unsubAssignments?.();
      unsubGoals?.();
      unsubTimeline?.();
      unsubSolutions?.();
      unsubRevision?.();

      if (!firebaseUser) {
        const local = loadLocalStore();
        setProfile(local.profile);
        setAssignments(local.assignments);
        setGoals(local.goals);
        setTimelineEvents(local.timelineEvents);
        setSavedSolutions(local.savedSolutions);
        setRevisionItems(local.revisionItems);
        return;
      }

      try {
        await ensureUserSeeded(firebaseUser.uid, firebaseUser.displayName || 'Student');
      } catch (err) {
        setSyncError(err instanceof Error ? err.message : 'Unable to initialize cloud profile.');
        return;
      }

      const uid = firebaseUser.uid;
      unsubProfile = onSnapshot(
        doc(db, 'users', uid),
        (snap) => {
          if (snap.exists()) {
            const d = snap.data();
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
          }
        },
        (error) => handleFirestoreError(error, OperationType.GET, `users/${uid}`)
      );

      unsubAssignments = onSnapshot(
        query(collection(db, 'users', uid, 'assignments'), orderBy('dueDate', 'asc')),
        (snap) => {
          setAssignments(
            snap.docs.map((docSnap) => {
              const d = docSnap.data();
              return {
                id: docSnap.id,
                userId: d.userId,
                title: d.title,
                subject: d.subject,
                dueDate: d.dueDate,
                status: d.status,
              };
            })
          );
        },
        (error) => handleFirestoreError(error, OperationType.LIST, `users/${uid}/assignments`)
      );

      unsubGoals = onSnapshot(
        query(collection(db, 'users', uid, 'goals'), orderBy('createdAt', 'asc')),
        (snap) => {
          setGoals(
            snap.docs.map((docSnap) => {
              const d = docSnap.data();
              return {
                id: docSnap.id,
                userId: d.userId,
                title: d.title,
                completed: Boolean(d.completed),
              };
            })
          );
        },
        (error) => handleFirestoreError(error, OperationType.LIST, `users/${uid}/goals`)
      );

      unsubTimeline = onSnapshot(
        query(collection(db, 'users', uid, 'timelineEvents'), orderBy('time', 'asc')),
        (snap) => {
          setTimelineEvents(
            snap.docs.map((docSnap) => {
              const d = docSnap.data();
              return {
                id: docSnap.id,
                userId: d.userId,
                title: d.title,
                time: d.time,
                date: d.date,
                colorTheme: d.colorTheme,
              };
            })
          );
        },
        (error) => handleFirestoreError(error, OperationType.LIST, `users/${uid}/timelineEvents`)
      );

      unsubSolutions = onSnapshot(
        query(collection(db, 'users', uid, 'savedSolutions'), orderBy('createdAt', 'desc')),
        (snap) => {
          setSavedSolutions(
            snap.docs.map((docSnap) => {
              const d = docSnap.data();
              return {
                id: docSnap.id,
                userId: d.userId,
                question: d.question,
                subject: d.subject,
                finalAnswer: d.finalAnswer,
                steps: Array.isArray(d.steps) ? d.steps : [],
              };
            })
          );
        },
        (error) => handleFirestoreError(error, OperationType.LIST, `users/${uid}/savedSolutions`)
      );

      unsubRevision = onSnapshot(
        query(collection(db, 'users', uid, 'revisionItems'), orderBy('createdAt', 'desc')),
        (snap) => {
          setRevisionItems(
            snap.docs.map((docSnap) => {
              const d = docSnap.data();
              return {
                id: docSnap.id,
                userId: d.userId,
                toolType: d.toolType,
                topic: d.topic,
                summaryText: d.summaryText,
                items: Array.isArray(d.items) ? d.items : [],
              };
            })
          );
        },
        (error) => handleFirestoreError(error, OperationType.LIST, `users/${uid}/revisionItems`)
      );
    });

    return () => {
      unsubAuth();
      unsubProfile?.();
      unsubAssignments?.();
      unsubGoals?.();
      unsubTimeline?.();
      unsubSolutions?.();
      unsubRevision?.();
    };
  }, [ensureUserSeeded]);

  const signInWithGoogle = async (): Promise<boolean> => {
    setSyncError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      return true;
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Google sign-in was cancelled or blocked.');
      return false;
    }
  };

  const signOutUser = async () => {
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
  }) => {
    const id = `assign_${Date.now()}`;
    const cleanTitle = input.title.trim().slice(0, 160);
    const cleanSubject = input.subject.trim().slice(0, 80);

    if (!user) {
      setAssignments((prev) => [
        {
          id,
          userId: 'local-student',
          title: cleanTitle,
          subject: cleanSubject,
          dueDate: input.dueDate,
          status: input.status,
        },
        ...prev,
      ]);
      return;
    }

    const path = `users/${user.uid}/assignments/${id}`;
    try {
      await setDoc(doc(db, 'users', user.uid, 'assignments', id), {
        userId: user.uid,
        title: cleanTitle,
        subject: cleanSubject,
        dueDate: input.dueDate,
        status: input.status,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
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
        profile,
        assignments,
        goals,
        timelineEvents,
        savedSolutions,
        revisionItems,
        addAssignment,
        updateAssignmentStatus,
        deleteAssignment,
        addGoal,
        toggleGoal,
        deleteGoal,
        addTimelineEvent,
        deleteTimelineEvent,
        saveSolution,
        deleteSolution,
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
