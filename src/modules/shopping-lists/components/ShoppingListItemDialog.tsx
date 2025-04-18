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
import { useTranslation } from "react-i18next";
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
  const [isNameInputFocused, setIsNameInputFocused] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const { t } = useTranslation();

  const nameInputRef = useRef<HTMLInputElement>(null);
  const blurTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
    setNameQuery("");
    setIsNameInputFocused(false);
    setShowSuggestions(false);
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
    }
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
    } else {
      setNameQuery("");
      setIsNameInputFocused(false);
      setShowSuggestions(false);
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current);
      }
    }
  }, [isOpen]);

  useEffect(() => {
    setShowSuggestions(
      isNameInputFocused && nameQuery.length > 0 && !isEditing,
    );
  }, [isNameInputFocused, nameQuery, isEditing]);

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  const handleSubmit = async () => {
    await form.handleSubmit();
    form.reset();
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          handleCancel();
        }
        setIsOpen(open);
      }}
    >
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent ref={contentRef} className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing
              ? t("shoppingLists.shoppingListItemDialog.editItem")
              : t("shoppingLists.shoppingListItemDialog.addItem")}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? t("shoppingLists.shoppingListItemDialog.editItemDescription")
              : t("shoppingLists.shoppingListItemDialog.addItemDescription")}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
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
                label={t("shoppingLists.shoppingListItemDialog.name")}
                error={field.state.meta.errors?.[0]}
                className="relative"
              >
                <div className="relative">
                  <Input
                    ref={nameInputRef}
                    value={field.state.value}
                    onChange={(e) => handleNameChange(e.target.value)}
                    onFocus={() => setIsNameInputFocused(true)}
                    onBlur={() => {
                      if (blurTimeoutRef.current) {
                        clearTimeout(blurTimeoutRef.current);
                      }
                      blurTimeoutRef.current = setTimeout(() => {
                        setIsNameInputFocused(false);
                      }, 200);
                    }}
                    placeholder={t(
                      "shoppingLists.shoppingListItemDialog.namePlaceholder",
                    )}
                  />
                  {showSuggestions && (
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
                  label={t("shoppingLists.shoppingListItemDialog.quantity")}
                  error={field.state.meta.errors?.[0]}
                >
                  <Input
                    type="number"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder={t(
                      "shoppingLists.shoppingListItemDialog.quantityPlaceholder",
                    )}
                  />
                </FormField>
              )}
            </form.Field>

            <form.Field name="unit">
              {(field) => (
                <FormField
                  name="unit"
                  label={t("shoppingLists.shoppingListItemDialog.unit")}
                  error={field.state.meta.errors?.[0]}
                >
                  <Input
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder={t(
                      "shoppingLists.shoppingListItemDialog.unitPlaceholder",
                    )}
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
                {t("shoppingLists.shoppingListItemDialog.createAnotherItem")}
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
              {t("shoppingLists.shoppingListItemDialog.cancel")}
            </Button>
            <Button type="submit" className="w-full sm:w-auto">
              {isEditing
                ? t("shoppingLists.shoppingListItemDialog.saveChanges")
                : t("shoppingLists.shoppingListItemDialog.addItem")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
