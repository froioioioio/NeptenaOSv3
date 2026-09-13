import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { 
  getAuth, 
  Auth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithEmailAndPassword as firebaseSignInWithEmail,
  createUserWithEmailAndPassword as firebaseCreateUserWithEmail,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  User as FirebaseUser,
  NextOrObserver
} from 'firebase/auth';
import { 
  getFirestore, 
  Firestore, 
  doc, 
  getDoc, 
  setDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import firebaseConfigData from '@/firebase-applet-config.json';

// Firebase configuration loaded from project setup or environment variables
export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || firebaseConfigData.apiKey,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || firebaseConfigData.authDomain,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || firebaseConfigData.projectId,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || firebaseConfigData.storageBucket,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || firebaseConfigData.messagingSenderId,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || firebaseConfigData.appId,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || firebaseConfigData.measurementId || undefined,
};

export const FIRESTORE_DATABASE_ID = process.env.NEXT_PUBLIC_FIRESTORE_DATABASE_ID || firebaseConfigData.firestoreDatabaseId || '(default)';

// Initialize Firebase App instance safely (singleton pattern)
export function getFirebaseApp(): FirebaseApp {
  if (getApps().length > 0) {
    return getApp();
  }
  return initializeApp(firebaseConfig);
}

// Initialize Auth
export function getFirebaseAuth(): Auth {
  const app = getFirebaseApp();
  return getAuth(app);
}

// Initialize Firestore (supporting custom databaseId from Firebase config)
export function getFirebaseFirestore(): Firestore {
  const app = getFirebaseApp();
  if (firebaseConfigData.firestoreDatabaseId && firebaseConfigData.firestoreDatabaseId !== '(default)') {
    return getFirestore(app, firebaseConfigData.firestoreDatabaseId);
  }
  return getFirestore(app);
}

// Auth helpers
let cachedGoogleAuthProvider: GoogleAuthProvider | null = null;
export function getGoogleAuthProvider(): GoogleAuthProvider {
  if (!cachedGoogleAuthProvider) {
    cachedGoogleAuthProvider = new GoogleAuthProvider();
  }
  return cachedGoogleAuthProvider;
}
export const googleAuthProvider = new Proxy({} as GoogleAuthProvider, {
  get(_target, prop) {
    const provider = getGoogleAuthProvider();
    const val = (provider as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof val === 'function') {
      return val.bind(provider);
    }
    return val;
  }
});

export interface SyntheticUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  isAnonymous: boolean;
  role?: string;
  authMethod?: 'google' | 'email_password' | 'credentials';
}

export type User = FirebaseUser | SyntheticUser;

// Session key constant
const LOCAL_SESSION_KEY = 'neptena_founder_session';
const LOCAL_SESSION_EMAIL_KEY = 'neptena_founder_session_email';

// In-memory subscribers for state changes
const authSubscribers = new Set<(user: User | null) => void>();

function notifyAuthSubscribers(user: User | null) {
  authSubscribers.forEach((callback) => {
    try {
      if (typeof callback === 'function') {
        callback(user);
      }
    } catch (err) {
      console.error('Error in auth subscriber callback:', err);
    }
  });
}

// Web Crypto Hash utilities
async function hashPasswordWithSalt(password: string, salt: string): Promise<string> {
  if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
    // Basic fallback for server environments
    let hash = 0;
    const str = `${salt}:${password}:neptena_2026`;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(16);
  }
  const enc = new TextEncoder();
  const data = enc.encode(`${salt}:${password}:neptena_2026_founder_vault`);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateRandomSalt(): string {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    const array = new Uint8Array(16);
    window.crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function getStoredLocalUser(): SyntheticUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LOCAL_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SyntheticUser;
  } catch {
    return null;
  }
}

function setStoredLocalUser(user: SyntheticUser | null) {
  if (typeof window === 'undefined') return;
  try {
    if (user) {
      localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(user));
      if (user.email) {
        localStorage.setItem(LOCAL_SESSION_EMAIL_KEY, user.email);
      }
    } else {
      localStorage.removeItem(LOCAL_SESSION_KEY);
      localStorage.removeItem(LOCAL_SESSION_EMAIL_KEY);
    }
  } catch (err) {
    console.error('Failed to set local auth session:', err);
  }
}

// 1. Non-SSO Account Registration
export async function registerWithEmailPassword(email: string, pass: string): Promise<{ user: User }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !pass) {
    throw new Error('Please provide a valid email and password.');
  }
  if (pass.length < 6) {
    throw new Error('Password must be at least 6 characters in length.');
  }

  const auth = getFirebaseAuth();
  const db = getFirebaseFirestore();

  // Try Native Firebase Auth registration first
  try {
    const cred = await firebaseCreateUserWithEmail(auth, cleanEmail, pass);
    const syntheticUser: SyntheticUser = {
      uid: cred.user.uid,
      email: cred.user.email || cleanEmail,
      displayName: cred.user.displayName || cleanEmail.split('@')[0],
      photoURL: cred.user.photoURL || null,
      emailVerified: cred.user.emailVerified,
      isAnonymous: false,
      role: 'CEO / Lead Founder',
      authMethod: 'email_password'
    };
    
    setStoredLocalUser(syntheticUser);

    try {
      await setDoc(doc(db, 'founders', cred.user.uid), {
        email: cleanEmail,
        role: 'CEO / Lead Founder',
        authMethod: 'email_password',
        createdAt: serverTimestamp(),
        lastActive: serverTimestamp(),
      }, { merge: true });
    } catch {
      // Non-blocking Firestore profile write
    }

    notifyAuthSubscribers(syntheticUser);
    return { user: cred.user };
  } catch (nativeErr: unknown) {
    const errCode = (nativeErr as { code?: string })?.code;
    
    // If standard Firebase error like email-already-in-use or invalid-email, throw it
    if (errCode === 'auth/email-already-in-use') {
      throw new Error('This email address is already registered. Please sign in instead.');
    }
    if (errCode === 'auth/invalid-email') {
      throw new Error('Please enter a valid email address.');
    }
    if (errCode === 'auth/weak-password') {
      throw new Error('Password is too weak. Please use at least 6 characters.');
    }

    // If Email/Password is disabled in Firebase Identity Platform (auth/operation-not-allowed),
    // activate our secure Firestore-backed credential vault!
    const accountDocId = cleanEmail.replace(/[^a-z0-9]/g, '_');
    const accountRef = doc(db, 'founder_accounts', accountDocId);
    
    try {
      const existingSnap = await getDoc(accountRef);
      if (existingSnap.exists()) {
        throw new Error('This email address is already registered. Please switch to "Sign In".');
      }

      const salt = generateRandomSalt();
      const passwordHash = await hashPasswordWithSalt(pass, salt);
      const uid = `usr_${accountDocId}_${Date.now().toString(36)}`;

      const accountData = {
        uid,
        email: cleanEmail,
        passwordHash,
        salt,
        role: 'CEO / Lead Founder',
        authMethod: 'credentials',
        createdAt: serverTimestamp(),
        lastActive: serverTimestamp(),
      };

      await setDoc(accountRef, accountData);

      try {
        await setDoc(doc(db, 'founders', uid), {
          email: cleanEmail,
          role: 'CEO / Lead Founder',
          authMethod: 'credentials',
          createdAt: serverTimestamp(),
          lastActive: serverTimestamp(),
        }, { merge: true });
      } catch {
        // Non-blocking
      }

      const syntheticUser: SyntheticUser = {
        uid,
        email: cleanEmail,
        displayName: cleanEmail.split('@')[0],
        photoURL: null,
        emailVerified: true,
        isAnonymous: false,
        role: 'CEO / Lead Founder',
        authMethod: 'credentials'
      };

      setStoredLocalUser(syntheticUser);
      notifyAuthSubscribers(syntheticUser);
      return { user: syntheticUser };
    } catch (vaultErr: unknown) {
      if (vaultErr instanceof Error && vaultErr.message.includes('already registered')) {
        throw vaultErr;
      }
      throw new Error(vaultErr instanceof Error ? vaultErr.message : 'Account creation failed. Please try again.');
    }
  }
}

// 2. Non-SSO Account Login
export async function loginWithEmailPassword(email: string, pass: string): Promise<{ user: User }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !pass) {
    throw new Error('Please enter both email and password.');
  }

  const auth = getFirebaseAuth();
  const db = getFirebaseFirestore();

  // Try Native Firebase Auth first
  try {
    const cred = await firebaseSignInWithEmail(auth, cleanEmail, pass);
    const syntheticUser: SyntheticUser = {
      uid: cred.user.uid,
      email: cred.user.email || cleanEmail,
      displayName: cred.user.displayName || cleanEmail.split('@')[0],
      photoURL: cred.user.photoURL || null,
      emailVerified: cred.user.emailVerified,
      isAnonymous: false,
      role: 'CEO / Lead Founder',
      authMethod: 'email_password'
    };

    setStoredLocalUser(syntheticUser);

    try {
      await setDoc(doc(db, 'founders', cred.user.uid), {
        email: cleanEmail,
        role: 'CEO / Lead Founder',
        authMethod: 'email_password',
        lastActive: serverTimestamp(),
      }, { merge: true });
    } catch {
      // Non-blocking
    }

    notifyAuthSubscribers(syntheticUser);
    return { user: cred.user };
  } catch (nativeErr: unknown) {
    const errCode = (nativeErr as { code?: string })?.code;

    if (errCode === 'auth/wrong-password' || errCode === 'auth/invalid-credential') {
      throw new Error('Incorrect password. Please verify your credentials.');
    }
    if (errCode === 'auth/user-not-found') {
      throw new Error('No account found with this email. Click "Create Account" to register.');
    }
    if (errCode === 'auth/invalid-email') {
      throw new Error('Please enter a valid email address.');
    }

    // If native email/password is not allowed or failed, verify with Firestore credential vault
    const accountDocId = cleanEmail.replace(/[^a-z0-9]/g, '_');
    const accountRef = doc(db, 'founder_accounts', accountDocId);

    try {
      const snap = await getDoc(accountRef);
      if (!snap.exists()) {
        throw new Error('Account does not exist. Please switch to "Create Account" to register.');
      }

      const data = snap.data();
      const storedSalt = data.salt || '';
      const storedHash = data.passwordHash || '';
      const computedHash = await hashPasswordWithSalt(pass, storedSalt);

      if (computedHash !== storedHash) {
        throw new Error('Incorrect password. Please try again.');
      }

      const uid = data.uid || `usr_${accountDocId}`;
      const syntheticUser: SyntheticUser = {
        uid,
        email: cleanEmail,
        displayName: cleanEmail.split('@')[0],
        photoURL: null,
        emailVerified: true,
        isAnonymous: false,
        role: data.role || 'CEO / Lead Founder',
        authMethod: 'credentials'
      };

      setStoredLocalUser(syntheticUser);

      // Update last active
      try {
        await setDoc(accountRef, { lastActive: serverTimestamp() }, { merge: true });
        await setDoc(doc(db, 'founders', uid), {
          email: cleanEmail,
          role: data.role || 'CEO / Lead Founder',
          authMethod: 'credentials',
          lastActive: serverTimestamp(),
        }, { merge: true });
      } catch {
        // Non-blocking
      }

      notifyAuthSubscribers(syntheticUser);
      return { user: syntheticUser };
    } catch (vaultErr: unknown) {
      if (vaultErr instanceof Error) {
        throw vaultErr;
      }
      throw new Error('Authentication failed. Please verify your credentials.');
    }
  }
}

// 3. SSO Login & Registration with Google
export async function loginWithGoogle(): Promise<{ user: User }> {
  const auth = getFirebaseAuth();
  const db = getFirebaseFirestore();

  try {
    const cred = await signInWithPopup(auth, googleAuthProvider);
    const email = cred.user.email || 'founder@neptena.local';
    
    const syntheticUser: SyntheticUser = {
      uid: cred.user.uid,
      email: cred.user.email,
      displayName: cred.user.displayName || email.split('@')[0],
      photoURL: cred.user.photoURL || null,
      emailVerified: cred.user.emailVerified,
      isAnonymous: false,
      role: 'CEO / Lead Founder',
      authMethod: 'google'
    };

    setStoredLocalUser(syntheticUser);

    try {
      await setDoc(doc(db, 'founders', cred.user.uid), {
        email,
        displayName: cred.user.displayName || email.split('@')[0],
        photoURL: cred.user.photoURL || null,
        role: 'CEO / Lead Founder',
        authMethod: 'google',
        lastActive: serverTimestamp(),
      }, { merge: true });
    } catch {
      // Non-blocking
    }

    notifyAuthSubscribers(syntheticUser);
    return { user: cred.user };
  } catch (err: unknown) {
    const errCode = (err as { code?: string })?.code;
    if (errCode === 'auth/popup-closed-by-user') {
      throw new Error('Google sign-in popup was closed before completing authentication.');
    }
    if (errCode === 'auth/cancelled-popup-request') {
      throw new Error('Another sign-in popup is already open.');
    }
    if (errCode === 'auth/popup-blocked') {
      throw new Error('Sign-in popup was blocked by browser. Please allow popups or open in a new tab.');
    }
    throw err;
  }
}

// 4. Logout helper
export async function logoutUser(): Promise<void> {
  const auth = getFirebaseAuth();
  setStoredLocalUser(null);
  
  try {
    await firebaseSignOut(auth);
  } catch (err) {
    console.error('Firebase signout error:', err);
  }

  notifyAuthSubscribers(null);
}

// 5. Unified Auth State Listener
export function onAuthStateChanged(
  auth: Auth,
  nextOrObserver: NextOrObserver<User>,
  error?: (error: Error) => void
): () => void {
  if (!auth) {
    return () => {};
  }

  const listener = typeof nextOrObserver === 'function'
    ? nextOrObserver
    : (nextOrObserver && typeof (nextOrObserver as { next?: unknown }).next === 'function'
        ? (nextOrObserver as { next: (user: User | null) => void }).next.bind(nextOrObserver)
        : () => {});
  
  // Register in local subscriber list
  authSubscribers.add(listener);

  // Check initial state from Firebase Auth or Local Session
  try {
    const localUser = getStoredLocalUser();
    const currentFirebaseUser = auth.currentUser;

    if (currentFirebaseUser) {
      listener(currentFirebaseUser);
    } else if (localUser) {
      listener(localUser);
    } else {
      listener(null);
    }
  } catch (e) {
    console.error('Error during initial auth verification:', e);
  }

  // Subscribe to Firebase Auth changes
  let unsubscribeFirebase: (() => void) | null = null;
  if (typeof window !== 'undefined') {
    try {
      unsubscribeFirebase = firebaseOnAuthStateChanged(
        auth,
        (firebaseUser) => {
          try {
            if (firebaseUser) {
              listener(firebaseUser);
            } else {
              const stored = getStoredLocalUser();
              listener(stored || null);
            }
          } catch (err) {
            console.error('Error in onAuthStateChanged subscriber:', err);
          }
        },
        (err) => {
          if (typeof error === 'function') {
            try {
              error(err);
            } catch (invokeErr) {
              console.error('Error in onAuthStateChanged error handler:', invokeErr);
            }
          }
        }
      );
    } catch (e) {
      console.warn('Native Firebase onAuthStateChanged subscription fallback:', e);
    }
  }

  return () => {
    authSubscribers.delete(listener);
    if (typeof unsubscribeFirebase === 'function') {
      try {
        unsubscribeFirebase();
      } catch (err) {
        // Non-blocking
      }
    }
  };
}

// System Connectivity Probe
export interface SystemHealthReport {
  authStatus: 'connected' | 'error' | 'initializing';
  authMessage: string;
  dbStatus: 'connected' | 'error' | 'initializing';
  dbMessage: string;
  projectId: string;
  databaseId: string;
  latencyMs: number;
}

export async function probeSystemConnectivity(): Promise<SystemHealthReport> {
  const startTime = Date.now();
  const report: SystemHealthReport = {
    authStatus: 'initializing',
    authMessage: 'Checking Authentication Service...',
    dbStatus: 'initializing',
    dbMessage: 'Checking Firestore Connection...',
    projectId: firebaseConfigData.projectId,
    databaseId: FIRESTORE_DATABASE_ID,
    latencyMs: 0,
  };

  try {
    const auth = getFirebaseAuth();
    const localUser = getStoredLocalUser();
    const activeEmail = auth.currentUser?.email || localUser?.email;

    if (auth && auth.app) {
      report.authStatus = 'connected';
      report.authMessage = `Auth Provider Ready (${activeEmail ? `Authenticated as ${activeEmail}` : 'SSO & Credential Gate Active'})`;
    } else {
      report.authStatus = 'error';
      report.authMessage = 'Auth service instance could not be resolved.';
    }
  } catch (err: unknown) {
    report.authStatus = 'error';
    report.authMessage = err instanceof Error ? err.message : 'Unknown auth error';
  }

  try {
    const db = getFirebaseFirestore();
    const probeDocRef = doc(db, 'system_telemetry', 'connectivity_probe');
    await setDoc(probeDocRef, {
      lastPing: serverTimestamp(),
      system: 'Neptena-OS',
      phase: 0,
      timestamp: Date.now(),
    }, { merge: true });

    const snapshot = await getDoc(probeDocRef);
    if (snapshot.exists()) {
      report.dbStatus = 'connected';
      report.dbMessage = `Firestore DB [${FIRESTORE_DATABASE_ID}] operational and reachable.`;
    } else {
      report.dbStatus = 'connected';
      report.dbMessage = `Firestore DB [${FIRESTORE_DATABASE_ID}] connection verified.`;
    }
  } catch (err: unknown) {
    report.dbStatus = 'error';
    report.dbMessage = err instanceof Error ? err.message : 'Firestore connection error';
  }

  report.latencyMs = Date.now() - startTime;
  return report;
}
