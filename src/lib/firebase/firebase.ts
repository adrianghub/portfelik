import { logger } from "@/lib/logger";
import { initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  connectAuthEmulator,
  signOut as firebaseSignOut,
  getAuth,
  indexedDBLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  User,
} from "firebase/auth";
import {
  connectFirestoreEmulator,
  Firestore,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { getMessaging } from "firebase/messaging";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

setPersistence(auth, indexedDBLocalPersistence).catch((error) => {
  logger.error("Firebase Auth", "Error setting persistence:", error);
  // Fallback to browser local persistence if IndexedDB fails
  setPersistence(auth, browserLocalPersistence).catch((fallbackError) => {
    logger.error(
      "Firebase Auth",
      "Error setting fallback persistence:",
      fallbackError,
    );
  });
});

let db: Firestore;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
  logger.info(
    "Firestore",
    "Initialized with persistent cache and multi-tab support",
  );
} catch (err) {
  logger.error("Firestore", "Error initializing with persistent cache:", err);
  db = getFirestore(app);
  logger.warn("Firestore", "Using regular Firestore without persistence");
}
export { db };

export const functions = getFunctions(app);
export const messaging = getMessaging(app);

// Connect to emulators in development mode
const isDevelopment = import.meta.env.DEV;
if (isDevelopment) {
  const EMULATOR_HOST = "127.0.0.1";
  const AUTH_PORT = 9099;
  const FIRESTORE_PORT = 8080;
  const FUNCTIONS_PORT = 5001;

  connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${AUTH_PORT}`, {
    disableWarnings: true,
  });
  connectFirestoreEmulator(db, EMULATOR_HOST, FIRESTORE_PORT);
  connectFunctionsEmulator(functions, EMULATOR_HOST, FUNCTIONS_PORT);

  logger.info("Firebase", "Using Firebase emulators in development mode");
  logger.info(
    "Firebase",
    `Auth emulator: http://${EMULATOR_HOST}:${AUTH_PORT}`,
  );
  logger.info(
    "Firebase",
    `Firestore emulator: ${EMULATOR_HOST}:${FIRESTORE_PORT}`,
  );
  logger.info(
    "Firebase",
    `Functions emulator: ${EMULATOR_HOST}:${FUNCTIONS_PORT}`,
  );
}

/**
 * Signs in a user with email and password
 * @param email The user's email
 * @param password The user's password
 * @returns A promise that resolves with the user's credentials
 */
export async function signIn(email: string, password: string): Promise<User> {
  try {
    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password,
    );
    return userCredential.user;
  } catch (error) {
    if (error instanceof Error) {
      logger.error("Firebase Auth", "Sign in error:", error.message);
    }
    throw error;
  }
}

/**
 * Signs out the current user
 * @returns A promise that resolves when the user is signed out
 */
export async function signOut(): Promise<void> {
  try {
    await firebaseSignOut(auth);
  } catch (error) {
    if (error instanceof Error) {
      logger.error("Firebase Auth", "Sign out error:", error.message);
    }
    throw error;
  }
}

/**
 * Gets the current user
 * @returns A promise that resolves with the current user or null
 */
export const getCurrentUser = (): Promise<User | null> => {
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        unsubscribe();
        resolve(user);
      },
      (error) => {
        logger.error("Firebase Auth", "Auth state change error:", error);
        reject(error);
      },
    );
  });
};
