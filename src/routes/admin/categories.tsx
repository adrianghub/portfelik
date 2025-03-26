import { createAdminLoader } from "@/lib/protected-route";
import { CategoryManager } from "@/modules/admin/categories/components/CategoryManager";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/categories")({
  component: AdminCategoriesManagerView,
  loader: createAdminLoader(),
});

function AdminCategoriesManagerView() {
  return (
    <div className="py-6 px-4 md:px-6">
      <h2 className="text-2xl font-bold mb-6">Manage Categories</h2>
      <CategoryManager />
    </div>
  );
}
