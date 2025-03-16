import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/")({
  beforeLoad: () => {
    return redirect({
      to: "/admin/dashboard",
      replace: true,
    });
  },
});
