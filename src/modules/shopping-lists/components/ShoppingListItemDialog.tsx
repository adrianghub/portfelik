import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Label } from "@/components/ui/label";
import { useMobileDialog } from "@/hooks/useMobileDialog";
import { FormField } from "@/modules/shared/components/FormField";
import {
  createShoppingListItem,
  type ShoppingListItem,
} from "@/modules/shopping-lists/shopping-list";
import { useForm } from "@tanstack/react-form";
import { useEffect, useRef, useState } from "react";
import { ShoppingListItemSuggestions } from "./ShoppingListItemSuggestions";

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
  const [createNext, setCreateNext] = useState(true);
  const [nameQuery, setNameQuery] = useState("");

  const nameInputRef = useRef<HTMLInputElement>(null);

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : open;
  const setIsOpen = isControlled ? onOpenChange! : setOpen;

  const { contentRef, scrollToBottom } = useMobileDialog(isOpen);

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
        setIsOpen(false);
      } else if (onAddItem) {
        const newItem = createShoppingListItem(
          value.name.trim(),
          value.quantity ? parseFloat(value.quantity) : undefined,
          value.unit.trim() || undefined,
        );

        onAddItem(newItem);

        if (createNext) {
          form.reset();
          nameInputRef.current?.focus();
        } else {
          setIsOpen(false);
          scrollToBottom();
        }
      }
    },
  });

  const handleCancel = () => {
    form.reset();
    setIsOpen(false);
    scrollToBottom();
  };

  const handleNameChange = (value: string) => {
    setNameQuery(value);
    form.setFieldValue("name", value);
  };

  const handleSelectSuggestion = (item: ShoppingListItem) => {
    form.setFieldValue("name", item.name);
    if (item.quantity) {
      form.setFieldValue("quantity", item.quantity.toString());
    }
    if (item.unit) {
      form.setFieldValue("unit", item.unit);
    }
    setNameQuery("");
  };

  useEffect(() => {
    if (isOpen) {
      nameInputRef.current?.focus();
    }
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent ref={contentRef} className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Item" : "Add Item"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Edit the item details below."
              : "Add a new item to your shopping list."}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
          className="space-y-6"
        >
          <form.Field
            name="name"
            validators={{
              onChange: ({ value }) => validateItemName(value),
            }}
          >
            {(field) => (
              <FormField
                name="name"
                label="Name"
                error={field.state.meta.errors?.[0]}
                className="relative"
              >
                <div className="relative">
                  <Input
                    ref={nameInputRef}
                    value={field.state.value}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="e.g., Milk, Bread, etc."
                  />
                  {!isEditing && nameQuery && (
                    <ShoppingListItemSuggestions
                      query={nameQuery}
                      onSelectSuggestion={handleSelectSuggestion}
                    />
                  )}
                </div>
              </FormField>
            )}
          </form.Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <form.Field
              name="quantity"
              validators={{
                onChange: ({ value }) => validateQuantity(value),
              }}
            >
              {(field) => (
                <FormField
                  name="quantity"
                  label="Quantity"
                  error={field.state.meta.errors?.[0]}
                >
                  <Input
                    type="number"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="e.g., 2"
                  />
                </FormField>
              )}
            </form.Field>

            <form.Field name="unit">
              {(field) => (
                <FormField
                  name="unit"
                  label="Unit"
                  error={field.state.meta.errors?.[0]}
                >
                  <Input
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="e.g., kg, l"
                  />
                </FormField>
              )}
            </form.Field>
          </div>

          {!isEditing && (
            <div className="flex items-center space-x-2">
              <Checkbox
                id="createNext"
                checked={createNext}
                onCheckedChange={(checked) => setCreateNext(checked as boolean)}
              />
              <Label htmlFor="createNext">
                Create another item after this one
              </Label>
            </div>
          )}

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button type="submit" className="w-full sm:w-auto">
              {isEditing ? "Save Changes" : "Add Item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
