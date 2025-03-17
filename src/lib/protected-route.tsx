import { redirect } from "@tanstack/react-router";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { db, auth as firebaseAuth } from "./firebase";

interface LoaderFunctionArgs {
  context: unknown;
  location: {
    href: string;
    pathname: string;
  };
  params: Record<string, string>;
}

type LoaderFunction<T = unknown> = (args: LoaderFunctionArgs) => Promise<T> | T;

const getCurrentUser = (): Promise<User | null> => {
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
      firebaseAuth,
      (user) => {
        unsubscribe();
        resolve(user);
      },
      reject,
    );
  });
};

/**
 * Creates a loader function that checks if the user is authenticated
 * and redirects to the login page if not
 */
export function createProtectedLoader<T = unknown>(
  originalLoader?: LoaderFunction<T>,
): LoaderFunction<T | Record<string, never>> {
  return async (args: LoaderFunctionArgs) => {
    // Get current user using the helper function
    const currentUser = await getCurrentUser();

    // Check if user is authenticated
    if (!currentUser) {
      // Create a redirect URL with the current path as a query parameter
      const redirectUrl = `/login?redirect=${encodeURIComponent(args.location.pathname)}`;
      throw redirect({ to: redirectUrl });
    }

    // Call the original loader if it exists
    if (originalLoader) {
      return originalLoader(args);
    }

    return {} as T;
  };
}

/**
 * Creates a loader function that checks if the user is an admin
 * and redirects to the home page if not
 */
export function createAdminLoader<T = unknown>(
  originalLoader?: LoaderFunction<T>,
): LoaderFunction<T | Record<string, never>> {
  return async (args: LoaderFunctionArgs) => {
    // Get current user using the helper function
    const currentUser = await getCurrentUser();

    // Check if user is authenticated
    if (!currentUser) {
      // Create a redirect URL with the current path as a query parameter
      const redirectUrl = `/login?redirect=${encodeURIComponent(args.location.pathname)}`;
      throw redirect({ to: redirectUrl });
    }

    // Check if user is admin by fetching user data from Firestore
    const userRef = doc(db, "users", currentUser.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists() || userSnap.data().role !== "admin") {
      throw redirect({
        to: "/",
      });
    }

    // Call the original loader if it exists
    if (originalLoader) {
      return originalLoader(args);
    }

    return {} as T;
  };
}
