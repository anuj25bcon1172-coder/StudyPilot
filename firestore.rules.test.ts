/**
 * Security rules verification specification for Sturio.io.
 * Maps each of the 12 adversarial "Dirty Dozen" payloads to expected PERMISSION_DENIED outcomes
 * enforced by firestore.rules.
 */
export interface RuleTestCase {
  id: number;
  name: string;
  path: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  authUid: string | null;
  emailVerified: boolean;
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TESTS: RuleTestCase[] = [
  {
    id: 1,
    name: 'Unauthenticated read on user assignment',
    path: '/users/student1/assignments/a1',
    operation: 'get',
    authUid: null,
    emailVerified: false,
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Cross-user read attempt',
    path: '/users/student1/assignments/a1',
    operation: 'get',
    authUid: 'student2',
    emailVerified: true,
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Unverified email write attempt',
    path: '/users/student1/goals/g1',
    operation: 'create',
    authUid: 'student1',
    emailVerified: false,
    payload: { userId: 'student1', title: 'Read chapter 1', completed: false },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Identity spoofing via mismatched userId',
    path: '/users/student1/assignments/a2',
    operation: 'create',
    authUid: 'student1',
    emailVerified: true,
    payload: { userId: 'student2', title: 'Math', subject: 'Math', dueDate: '2026-12-01', status: 'Pending' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Shadow field injection on Goal create',
    path: '/users/student1/goals/g2',
    operation: 'create',
    authUid: 'student1',
    emailVerified: true,
    payload: { userId: 'student1', title: 'Study', completed: false, isAdmin: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Client-spoofed createdAt timestamp',
    path: '/users/student1/goals/g3',
    operation: 'create',
    authUid: 'student1',
    emailVerified: true,
    payload: { userId: 'student1', title: 'Study', completed: false, createdAt: '2020-01-01T00:00:00Z' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Invalid document ID characters',
    path: '/users/student1/goals/bad$id!',
    operation: 'create',
    authUid: 'student1',
    emailVerified: true,
    payload: { userId: 'student1', title: 'Study', completed: false },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Oversized title string (>160 chars)',
    path: '/users/student1/assignments/a3',
    operation: 'create',
    authUid: 'student1',
    emailVerified: true,
    payload: { userId: 'student1', title: 'x'.repeat(200), subject: 'Math', dueDate: '2026-12-01', status: 'Pending' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Invalid assignment status enum',
    path: '/users/student1/assignments/a4',
    operation: 'create',
    authUid: 'student1',
    emailVerified: true,
    payload: { userId: 'student1', title: 'Lab', subject: 'Physics', dueDate: '2026-12-01', status: 'Arbitrary' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Immutable createdAt mutation on update',
    path: '/users/student1/goals/g1',
    operation: 'update',
    authUid: 'student1',
    emailVerified: true,
    payload: { completed: true, createdAt: '2025-01-01T00:00:00Z' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Negative XP or out-of-bounds progress',
    path: '/users/student1',
    operation: 'update',
    authUid: 'student1',
    emailVerified: true,
    payload: { xp: -100, algebraProgress: 500 },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Terminal status mutation after Completed',
    path: '/users/student1/assignments/completed_a1',
    operation: 'update',
    authUid: 'student1',
    emailVerified: true,
    payload: { status: 'Pending' },
    expectedResult: 'PERMISSION_DENIED',
  },
];
