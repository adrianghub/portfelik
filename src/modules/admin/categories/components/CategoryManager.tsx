import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryProvider } from "@/modules/admin/categories/CategoryContext";
import { CategoryForm } from "@/modules/admin/categories/components/CategoryForm";
import { CategoryTable } from "@/modules/admin/categories/components/CategoryTable";

export function CategoryManager() {
  return (
    <CategoryProvider>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Manage Transaction Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryForm />
            <CategoryTable />
          </CardContent>
        </Card>
      </div>
    </CategoryProvider>
  );
}
