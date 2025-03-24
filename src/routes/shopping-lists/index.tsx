import { createProtectedLoader } from "@/lib/ProtectedRoute";
import { ShoppingListsView } from "@/modules/shopping-lists/components/ShoppingListsView";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/shopping-lists/")({
  component: ShoppingListsView,
  loader: createProtectedLoader(),
});
