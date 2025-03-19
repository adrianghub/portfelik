import { initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  signOut as firebaseSignOut,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  User,
} from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
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
export const db = getFirestore(app);
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

  console.log("Using Firebase emulators in development mode");
  console.log(`Auth emulator: http://${EMULATOR_HOST}:${AUTH_PORT}`);
  console.log(`Firestore emulator: ${EMULATOR_HOST}:${FIRESTORE_PORT}`);
  console.log(`Functions emulator: ${EMULATOR_HOST}:${FUNCTIONS_PORT}`);
}

/**
 * Signs in a user with email and password
 * @param email The user's email
 * @param password The user's password
 * @returns A promise that resolves with the user's credentials
 */
export async function signIn(email: string, password: string): Promise<User> {
  const userCredential = await signInWithEmailAndPassword(
    auth,
    email,
    password,
  );
  return userCredential.user;
}

/**
 * Signs out the current user
 * @returns A promise that resolves when the user is signed out
 */
export async function signOut(): Promise<void> {
  return firebaseSignOut(auth);
}

export const getCurrentUser = (): Promise<User | null> => {
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        unsubscribe();
        resolve(user);
      },
      reject,
    );
  });
};
