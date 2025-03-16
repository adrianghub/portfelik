import { CategoryManager } from "@/components/admin/CategoryManager";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/categories")({
  component: AdminCategories,
});

function AdminCategories() {
  return (
    <div>
      <h2 className='text-2xl font-bold mb-6'>Manage Categories</h2>
      <CategoryManager />
    </div>
  );
}
