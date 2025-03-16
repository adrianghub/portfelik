import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryForm, CategoryProvider, CategoryTable } from "./categories";

export function CategoryManager() {
  return (
    <CategoryProvider>
      <div className='space-y-6'>
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
