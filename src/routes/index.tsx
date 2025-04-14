import { createProtectedLoader } from "@/lib/protected-route";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  loader: createProtectedLoader(),
});
