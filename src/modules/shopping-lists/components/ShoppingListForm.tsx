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
import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";
import { useUserGroups } from "@/modules/settings/hooks/useUserGroups";
import { useFetchCategories } from "@/modules/shared/categories/useCategoriesQuery";
import { CategoryCombobox } from "@/modules/shared/components/CategoryCombobox";
import { FormField } from "@/modules/shared/components/FormField";
import {
  createShoppingList,
  type ShoppingList,
} from "@/modules/shopping-lists/shopping-list";
import { useForm } from "@tanstack/react-form";
import { Users } from "lucide-react";
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
  const { data: userGroups = [], isLoading: loadingGroups } = useUserGroups();

  const form = useForm({
    defaultValues: {
      name: initialValues?.name || "",
      categoryId: initialValues?.categoryId || "",
      groupId: initialValues?.groupId || "",
    },
    onSubmit: async ({ value }) => {
      try {
        setIsSubmitting(true);
        const newList = createShoppingList(
          value.name,
          userId,
          value.categoryId,
          value.groupId || undefined,
        );
        onSubmit(newList);
      } catch (error) {
        logger.error("ShoppingListForm", "Error submitting form:", error);
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  const expenseCategories = categories.filter(
    (category) => category.type === "expense",
  );

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
          <FormField
            name="name"
            label="List Name"
            error={field.state.meta.errors?.[0]}
          >
            <Input
              id="name"
              placeholder="e.g., Weekly groceries"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          </FormField>
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
          <FormField
            name="category"
            label="Category"
            error={field.state.meta.errors?.[0]}
          >
            <div className="relative">
              <CategoryCombobox
                categories={expenseCategories}
                value={field.state.value}
                onValueChange={field.handleChange}
                disabled={loadingCategories}
              />
              {loadingCategories && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              )}
            </div>
          </FormField>
        )}
      </form.Field>

      <form.Field name="groupId">
        {(field) => (
          <FormField
            name="group"
            label="Share with Group (Optional)"
            error={field.state.meta.errors?.[0]}
          >
            <div className="relative">
              {loadingGroups ? (
                <div className="flex items-center space-x-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <span className="text-sm text-muted-foreground">
                    Loading groups...
                  </span>
                </div>
              ) : userGroups.length === 0 ? (
                <div className="text-sm text-muted-foreground flex items-center space-x-2">
                  <Users className="h-4 w-4" />
                  <span>You don't have any groups yet</span>
                </div>
              ) : (
                <Select
                  value={field.state.value || "none"}
                  onValueChange={(value) =>
                    field.handleChange(value === "none" ? "" : value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a group to share with" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Personal (not shared)</SelectItem>
                    {userGroups.map((group) => (
                      <SelectItem
                        key={group.id}
                        value={group.id || `group-${group.name}`}
                      >
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </FormField>
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
