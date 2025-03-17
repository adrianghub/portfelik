import { redirect } from "@tanstack/react-router";
import { doc, getDoc } from "firebase/firestore";
import { db, getCurrentUser } from "./firebase/firebase";

interface LoaderFunctionArgs {
  context: unknown;
  location: {
    href: string;
    pathname: string;
  };
  params: Record<string, string>;
}

type LoaderFunction<T = unknown> = (args: LoaderFunctionArgs) => Promise<T> | T;

/**
 * Creates a loader function that checks if the user is authenticated
 * and redirects to the login page if not
 */
export function createProtectedLoader<T = unknown>(
  originalLoader?: LoaderFunction<T>,
): LoaderFunction<T | Record<string, never>> {
  return async (args: LoaderFunctionArgs) => {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      const redirectUrl = `/login?redirect=${encodeURIComponent(args.location.pathname)}`;
      throw redirect({ to: redirectUrl });
    }

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
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      const redirectUrl = `/login?redirect=${encodeURIComponent(args.location.pathname)}`;
      throw redirect({ to: redirectUrl });
    }

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
