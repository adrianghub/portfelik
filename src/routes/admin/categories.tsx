import { createAdminLoader } from "@/lib/ProtectedRoute";
import { CategoryManager } from "@/modules/admin/categories/components/CategoryManager";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/categories")({
  component: AdminCategories,
  loader: createAdminLoader(),
});

function AdminCategories() {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Manage Categories</h2>
      <CategoryManager />
    </div>
  );
}
