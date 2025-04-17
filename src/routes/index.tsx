import { getCurrentUser } from "@/lib/firebase/firebase";
import { createProtectedLoader } from "@/lib/protected-route";
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  loader: createProtectedLoader(async () => {
    const currentUser = await getCurrentUser();

    if (currentUser) {
      return redirect({
        to: "/transactions",
        replace: true,
      });
    }

    return {};
  }),
});
