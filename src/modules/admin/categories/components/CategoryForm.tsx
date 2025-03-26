import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAddCategory } from "@/modules/shared/categories/useCategoriesQuery";
import type { Category } from "@/modules/shared/category";
import { Plus } from "lucide-react";
import { useState } from "react";

export function CategoryForm() {
  const createCategoryMutation = useAddCategory();
  const [newCategory, setNewCategory] = useState<Category>({
    id: "",
    name: "",
    type: "expense",
  });

  const handleAddCategory = () => {
    if (!newCategory.name.trim()) return;

    createCategoryMutation.mutate(newCategory);
    setNewCategory({ id: "", name: "", type: "expense" });
  };

  return (
    <div className="flex gap-4 mb-6">
      <div className="flex-1">
        <Input
          placeholder="Category name"
          value={newCategory.name}
          onChange={(e) =>
            setNewCategory({ ...newCategory, name: e.target.value })
          }
        />
      </div>
      <div className="col-span-4">
        <Select
          value={newCategory.type}
          onValueChange={(value) =>
            setNewCategory({
              ...newCategory,
              type: value as "income" | "expense",
            })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="income">Income</SelectItem>
            <SelectItem value="expense">Expense</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="col-span-2">
        <Button
          onClick={handleAddCategory}
          disabled={!newCategory.name.trim()}
          className="flex items-center gap-1"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Add</span>
        </Button>
      </div>
    </div>
  );
}
