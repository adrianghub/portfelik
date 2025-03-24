import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FormField } from "@/modules/shared/components/FormField";
import {
  createShoppingListItem,
  type ShoppingListItem,
} from "@/modules/shopping-lists/shopping-list";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";

interface ShoppingListItemDialogProps {
  trigger?: React.ReactNode;
  onAddItem?: (item: ShoppingListItem) => void;
  onUpdateItem?: (itemId: string, item: Partial<ShoppingListItem>) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  initialValues?: ShoppingListItem | null;
}

const validateItemName = (value: string) => {
  if (!value.trim()) {
    return "Item name is required";
  }
  return undefined;
};

const validateQuantity = (value: string) => {
  if (value && parseFloat(value) <= 0) {
    return "Quantity must be greater than 0";
  }
  return undefined;
};

export function ShoppingListItemDialog({
  trigger,
  onAddItem,
  onUpdateItem,
  open: controlledOpen,
  onOpenChange,
  initialValues,
}: ShoppingListItemDialogProps) {
  const [open, setOpen] = useState(false);

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : open;
  const setIsOpen = isControlled ? onOpenChange! : setOpen;

  const isEditing = !!initialValues?.id;

  const form = useForm({
    defaultValues: {
      name: initialValues?.name || "",
      quantity: initialValues?.quantity?.toString() || "",
      unit: initialValues?.unit || "",
    },
    onSubmit: ({ value }) => {
      if (isEditing && onUpdateItem && initialValues) {
        const updates: Partial<ShoppingListItem> = {
          name: value.name.trim(),
        };

        if (value.quantity !== undefined && value.quantity !== null) {
          updates.quantity = value.quantity
            ? parseFloat(value.quantity)
            : undefined;
        }

        if (value.unit !== undefined) {
          updates.unit = value.unit.trim() || undefined;
        }

        onUpdateItem(initialValues.id, updates);
      } else if (onAddItem) {
        const newItem = createShoppingListItem(
          value.name.trim(),
          value.quantity ? parseFloat(value.quantity) : undefined,
          value.unit.trim() || undefined,
        );

        onAddItem(newItem);
      }

      form.reset();
      setIsOpen(false);
    },
  });

  const handleCancel = () => {
    form.reset();
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="w-full max-w-md mx-auto sm:max-w-lg p-4 sm:p-6 overflow-y-auto max-h-[95vh]">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {isEditing ? "Edit Item" : "Add Item"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the item details below."
              : "Fill out the form below to add an item to your shopping list."}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
          className="space-y-4 mt-4"
        >
          <div className="grid gap-4 py-4">
            <form.Field
              name="name"
              validators={{
                onChange: ({ value }) => validateItemName(value),
              }}
            >
              {(field) => (
                <FormField
                  name="name"
                  label="Item Name"
                  error={field.state.meta.errors?.[0]}
                >
                  <Input
                    id="name"
                    placeholder="Enter item name"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </FormField>
              )}
            </form.Field>

            <form.Field
              name="quantity"
              validators={{
                onChange: ({ value }) => validateQuantity(value),
              }}
            >
              {(field) => (
                <FormField
                  name="quantity"
                  label="Quantity (optional)"
                  error={field.state.meta.errors?.[0]}
                >
                  <Input
                    id="quantity"
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="Enter quantity"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </FormField>
              )}
            </form.Field>

            <form.Field name="unit">
              {(field) => (
                <FormField
                  name="unit"
                  label="Unit (optional)"
                  error={field.state.meta.errors?.[0]}
                >
                  <Input
                    id="unit"
                    placeholder="Enter unit (e.g., kg, pcs)"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </FormField>
              )}
            </form.Field>
          </div>

          <DialogFooter className="flex gap-2 mt-6">
            <Button type="button" variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.state.canSubmit === false}>
              {isEditing ? "Update Item" : "Add Item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
