import { getCurrentUser } from "@/lib/firebase/firebase";
import { logger } from "@/lib/logger";
import { LoginForm } from "@/modules/login/LoginForm";
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/login")({
  component: LoginView,
  loader: async () => {
    try {
      const currentUser = await getCurrentUser();

      if (currentUser) {
        return redirect({
          to: "/",
          replace: true,
        });
      }

      return {};
    } catch (error) {
      logger.warn("Login", "Error checking current user:", error);
      return {};
    }
  },
});

function LoginView() {
  return <LoginForm />;
}
