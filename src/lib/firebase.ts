import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  doc,
  FirestoreSettings,
  getDocFromServer,
  initializeFirestore,
} from 'firebase/firestore';

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

const firebaseConfig: FirebaseAppletConfig = {
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

const app = initializeApp(firebaseConfig);

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
