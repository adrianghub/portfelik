import { LoginForm } from "@/components/auth/LoginForm";
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

export const Route = createFileRoute("/login")({
  component: LoginPage,
  loader: async () => {
    // Get current user using the helper function
    const currentUser = await getCurrentUser();

    // If user is already logged in, redirect to home
    if (currentUser) {
      throw redirect({ to: "/" });
    }
    return {};
  },
});

function LoginPage() {
  return <LoginForm />;
}
