import { auth as firebaseAuth } from "@/lib/firebase";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { onAuthStateChanged } from "firebase/auth";

// Helper function to get the current user
const getCurrentUser = () => {
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

export const Route = createFileRoute("/")({
  loader: async () => {
    // Get current user using the helper function
    const currentUser = await getCurrentUser();

    // If user is not authenticated, redirect to login
    if (!currentUser) {
      return redirect({
        to: "/login",
        replace: true,
      });
    }

    // If authenticated, redirect to transactions
    return redirect({
      to: "/transactions",
      replace: true,
    });
  },
});
