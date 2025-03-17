import { getCurrentUser } from "@/lib/firebase/firebase";
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  loader: async () => {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return redirect({
        to: "/login",
        replace: true,
      });
    }

    return redirect({
      to: "/transactions",
      replace: true,
    });
  },
});
