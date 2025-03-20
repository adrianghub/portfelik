import { getCurrentUser } from "@/lib/firebase/firebase";
import { registerServiceWorker } from "@/lib/service-worker";
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  loader: async () => {
    const sw = await registerServiceWorker();

    if (sw) {
      console.log("[Service worker] - Registered");
    } else {
      console.log("[Service worker] - Not registered");
    }

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
