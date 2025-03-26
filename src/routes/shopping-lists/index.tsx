import { createProtectedLoader } from "@/lib/protected-route";
import { ShoppingListsView } from "@/modules/shopping-lists/components/ShoppingListsView";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/shopping-lists/")({
  component: ShoppingListsView,
  loader: createProtectedLoader(),
});
