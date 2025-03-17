import { getCurrentUser } from "@/lib/firebase/firebase";
import { LoginForm } from "@/modules/login/LoginForm";
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  loader: async () => {
    const currentUser = await getCurrentUser();

    if (currentUser) {
      throw redirect({ to: "/" });
    }
    return {};
  },
});

function LoginPage() {
  return <LoginForm />;
}
