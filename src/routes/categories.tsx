import { CategoryManager } from "@/components/admin/CategoryManager";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/categories")({
  component: Categories,
});

function Categories() {
  return (
    <div className="py-6">
      <h1 className="text-2xl font-bold mb-6">Manage Categories</h1>
      <CategoryManager />
    </div>
  );
}
