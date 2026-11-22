import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  collection,
  doc,
  FirestoreSettings,
  getDocFromServer,
  getDocs,
  initializeFirestore,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  getMessaging,
  getToken,
  isSupported,
  MessagePayload,
  Messaging,
  onMessage,
} from 'firebase/messaging';
import { Assignment } from '../types';

interface FirebaseAppletConfig {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  firestoreDatabaseId?: string;
}

const DEFAULT_FIREBASE_CONFIG: Required<FirebaseAppletConfig> = {
  apiKey: 'AIzaSyAQXHWfLRGcuTCF-kHTyLvxi3x_zW5tRlE',
  authDomain: 'gen-lang-client-0612463551.firebaseapp.com',
  projectId: 'gen-lang-client-0612463551',
  storageBucket: 'gen-lang-client-0612463551.firebasestorage.app',
  messagingSenderId: '513566555333',
  appId: '1:513566555333:web:ee424d4f90999555c8c4ac',
  firestoreDatabaseId: 'ai-studio-fd7c5334-670b-4a81-b4e6-3e9e70df57c1',
};

function readNonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

const configModules = import.meta.glob<{ default: FirebaseAppletConfig }>(
  '../../firebase-applet-config.json',
  { eager: true }
);

const localAppletConfig = Object.values(configModules)[0]?.default;

export const firebaseConfig: FirebaseAppletConfig = {
  apiKey:
    readNonEmpty(import.meta.env.VITE_FIREBASE_API_KEY) ||
    readNonEmpty(localAppletConfig?.apiKey) ||
    DEFAULT_FIREBASE_CONFIG.apiKey,
  authDomain:
    readNonEmpty(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN) ||
    readNonEmpty(localAppletConfig?.authDomain) ||
    DEFAULT_FIREBASE_CONFIG.authDomain,
  projectId:
    readNonEmpty(import.meta.env.VITE_FIREBASE_PROJECT_ID) ||
    readNonEmpty(localAppletConfig?.projectId) ||
    DEFAULT_FIREBASE_CONFIG.projectId,
  storageBucket:
    readNonEmpty(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET) ||
    readNonEmpty(localAppletConfig?.storageBucket) ||
    DEFAULT_FIREBASE_CONFIG.storageBucket,
  messagingSenderId:
    readNonEmpty(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID) ||
    readNonEmpty(localAppletConfig?.messagingSenderId) ||
    DEFAULT_FIREBASE_CONFIG.messagingSenderId,
  appId:
    readNonEmpty(import.meta.env.VITE_FIREBASE_APP_ID) ||
    readNonEmpty(localAppletConfig?.appId) ||
    DEFAULT_FIREBASE_CONFIG.appId,
  firestoreDatabaseId:
    readNonEmpty(import.meta.env.VITE_FIREBASE_DATABASE_ID) ||
    readNonEmpty(localAppletConfig?.firestoreDatabaseId) ||
    DEFAULT_FIREBASE_CONFIG.firestoreDatabaseId,
};

export const app = initializeApp(firebaseConfig);

const firestoreSettings = {
  experimentalForceLongPolling: true,
  useFetchStreams: false,
} as FirestoreSettings;

export const db = firebaseConfig.firestoreDatabaseId
  ? initializeFirestore(app, firestoreSettings, firebaseConfig.firestoreDatabaseId)
  : initializeFirestore(app, firestoreSettings);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

let cachedMessaging: Messaging | null = null;
let messagingInitPromise: Promise<Messaging | null> | null = null;

export async function getFirebaseMessaging(): Promise<Messaging | null> {
  if (cachedMessaging) return cachedMessaging;
  if (typeof window === 'undefined') return null;

  if (!messagingInitPromise) {
    messagingInitPromise = isSupported()
      .then((supported) => {
        if (!supported) return null;
        cachedMessaging = getMessaging(app);
        return cachedMessaging;
      })
      .catch(() => null);
  }

  return messagingInitPromise;
}

export async function registerMessagingServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
    scope: '/',
  });

  if (registration.active) {
    return registration;
  }

  // Wait briefly for newly installed service worker to become active before calling getToken
  await Promise.race([
    navigator.serviceWorker.ready,
    new Promise((resolve) => window.setTimeout(resolve, 4000)),
  ]);

  return registration;
}

export interface FcmTokenRequestResult {
  token: string | null;
  reason?: 'unsupported' | 'permission-denied' | 'missing-vapid-key' | 'token-error';
  errorMessage?: string;
}

export async function requestFcmDeviceToken(): Promise<FcmTokenRequestResult> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return {
      token: null,
      reason: 'unsupported',
      errorMessage: 'Browser notifications are not supported in this environment.',
    };
  }

  const permission = Notification.permission;
  if (permission !== 'granted') {
    return {
      token: null,
      reason: 'permission-denied',
      errorMessage: 'Notification permission has not been granted.',
    };
  }

  const messagingInstance = await getFirebaseMessaging();
  if (!messagingInstance) {
    return {
      token: null,
      reason: 'unsupported',
      errorMessage: 'Firebase Cloud Messaging is not supported in this browser.',
    };
  }

  const vapidKey = readNonEmpty(import.meta.env.VITE_FIREBASE_VAPID_KEY);
  if (!vapidKey) {
    return {
      token: null,
      reason: 'missing-vapid-key',
      errorMessage:
        'VITE_FIREBASE_VAPID_KEY is not configured. Foreground reminders are active; add your Firebase Web Push VAPID key for background FCM tokens.',
    };
  }

  try {
    const swRegistration = await registerMessagingServiceWorker();
    const token = await getToken(messagingInstance, {
      vapidKey,
      ...(swRegistration ? { serviceWorkerRegistration: swRegistration } : {}),
    });

    if (!token) {
      return {
        token: null,
        reason: 'token-error',
        errorMessage: 'No FCM registration token was returned by Firebase Messaging.',
      };
    }

    return { token };
  } catch (err) {
    return {
      token: null,
      reason: 'token-error',
      errorMessage: err instanceof Error ? err.message : 'Failed to retrieve FCM device token.',
    };
  }
}

export async function subscribeForegroundFcmMessages(
  callback: (payload: MessagePayload) => void
): Promise<() => void> {
  const messagingInstance = await getFirebaseMessaging();
  if (!messagingInstance) {
    return () => undefined;
  }
  return onMessage(messagingInstance, callback);
}

function hashTokenForDocId(token: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < token.length; i += 1) {
    const code = token.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= code + i;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

export async function syncFcmTokenToFirestore(params: {
  userId: string;
  token: string;
  assignments: Assignment[];
}): Promise<void> {
  const { userId, token, assignments } = params;
  const cleanToken = token.trim().slice(0, 512);
  if (!userId || cleanToken.length < 20) return;

  const incompleteAssignments = assignments
    .filter((a) => a.status !== 'Completed' && Boolean(a.dueDate))
    .slice(0, 100);

  const dueDates = Array.from(new Set(incompleteAssignments.map((a) => a.dueDate))).sort().slice(0, 100);
  const activeAssignments = incompleteAssignments.map((a) => ({
    assignmentId: a.id,
    title: a.title.slice(0, 160),
    subject: a.subject.slice(0, 80),
    dueDate: a.dueDate,
    status: a.status,
  }));

  const tokenDocId = `${userId}_${hashTokenForDocId(cleanToken)}`.slice(0, 128);
  const tokenRef = doc(db, 'fcmTokens', tokenDocId);
  const path = `fcmTokens/${tokenDocId}`;

  try {
    const existingTokensSnap = await getDocs(
      query(collection(db, 'fcmTokens'), where('userId', '==', userId))
    );
    const alreadyExists = existingTokensSnap.docs.some((d) => d.id === tokenDocId);

    if (alreadyExists) {
      await updateDoc(tokenRef, {
        token: cleanToken,
        dueDates,
        activeAssignments,
        platform: 'web',
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(tokenRef, {
        userId,
        token: cleanToken,
        dueDates,
        activeAssignments,
        platform: 'web',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function testConnection(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
    return false;
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
