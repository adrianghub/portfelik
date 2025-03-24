import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/AuthContext";
import { logger } from "@/lib/logger";
import { useFetchCategories } from "@/modules/shared/useCategoriesQuery";
import {
  createShoppingList,
  type ShoppingList,
} from "@/modules/shopping-lists/shopping-list";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";

interface ShoppingListFormProps {
  onSubmit: (shoppingList: Omit<ShoppingList, "id">) => void;
  initialValues?: Partial<ShoppingList>;
  onCancel?: () => void;
}

export function ShoppingListForm({
  onSubmit,
  initialValues,
  onCancel,
}: ShoppingListFormProps) {
  const { userData } = useAuth();
  const userId = userData?.uid || "";
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { data: categories = [], isLoading: loadingCategories } =
    useFetchCategories();

  const form = useForm({
    defaultValues: {
      name: initialValues?.name || "",
      categoryId: initialValues?.categoryId || "",
    },
    onSubmit: async ({ value }) => {
      try {
        setIsSubmitting(true);
        const newList = createShoppingList(
          value.name,
          userId,
          value.categoryId,
        );
        onSubmit(newList);
      } catch (error) {
        logger.error("ShoppingListForm", "Error submitting form:", error);
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  return (
    <form
      id="shopping-list-form"
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
      className="space-y-6"
    >
      <form.Field
        name="name"
        validators={{
          onChange: (field) => {
            const value = field.value;
            if (!value || value.length === 0) {
              return "Name is required";
            }
            return undefined;
          },
        }}
      >
        {(field) => (
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium">
              List Name
            </label>
            <Input
              id="name"
              placeholder="e.g., Weekly groceries"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
            />
            {field.state.meta.errors && (
              <p className="text-sm text-red-500">
                {field.state.meta.errors[0]}
              </p>
            )}
          </div>
        )}
      </form.Field>

      <form.Field
        name="categoryId"
        validators={{
          onChange: (field) => {
            if (!field.value) {
              return "Category is required";
            }
            return undefined;
          },
        }}
      >
        {(field) => (
          <div className="space-y-2">
            <label htmlFor="category" className="text-sm font-medium">
              Category
            </label>
            <Select
              value={field.state.value}
              onValueChange={field.handleChange}
            >
              <SelectTrigger id="category">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {loadingCategories ? (
                  <SelectItem value="loading" disabled>
                    Loading...
                  </SelectItem>
                ) : (
                  categories
                    .filter((category) => category.type === "expense")
                    .map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))
                )}
              </SelectContent>
            </Select>
            {field.state.meta.errors && (
              <p className="text-sm text-red-500">
                {field.state.meta.errors[0]}
              </p>
            )}
          </div>
        )}
      </form.Field>

      <DialogFooter>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : initialValues?.id ? "Update" : "Create"}
        </Button>
      </DialogFooter>
    </form>
  );
}
