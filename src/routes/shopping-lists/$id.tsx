import { createProtectedLoader } from "@/lib/protected-route";
import { ShoppingListDetailView } from "@/modules/shopping-lists/components/ShoppingListDetailView";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/shopping-lists/$id")({
  component: ShoppingListDetailPage,
  loader: createProtectedLoader(),
});

function ShoppingListDetailPage() {
  const { id } = Route.useParams();
  return <ShoppingListDetailView id={id} />;
}
