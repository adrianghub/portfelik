import { CategoryForm } from "@/modules/admin/categories/components/CategoryForm";
import { CategoryTable } from "@/modules/admin/categories/components/CategoryTable";
export function CategoryManager() {
  return (
    <div className="space-y-6">
      <CategoryForm />
      <CategoryTable />
    </div>
  );
}
