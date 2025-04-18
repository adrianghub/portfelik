import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMobileDialog } from "@/hooks/useMobileDialog";
import { useUserGroups } from "@/modules/settings/hooks/useUserGroups";
import { FormField } from "@/modules/shared/components/FormField";
import type { ShoppingList } from "@/modules/shopping-lists/shopping-list";
import { useForm } from "@tanstack/react-form";
import { Users } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

interface ShoppingListDetailFormProps {
  trigger?: React.ReactNode;
  onSave?: (shoppingList: ShoppingList) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  initialValues?: Partial<ShoppingList>;
}

const validateName = (value: string) => {
  if (!value.trim()) {
    return "List name is required";
  }
  if (value.trim().length > 50) {
    return "List name must be less than 50 characters";
  }
  return undefined;
};

export function ShoppingListDetailForm({
  trigger,
  onSave,
  open: controlledOpen,
  onOpenChange,
  initialValues,
}: ShoppingListDetailFormProps) {
  const [open, setOpen] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : open;
  const setIsOpen = isControlled ? onOpenChange! : setOpen;

  const { contentRef } = useMobileDialog(isOpen);

  const { data: userGroups = [], isLoading: loadingGroups } = useUserGroups();

  const { t } = useTranslation();

  const form = useForm({
    defaultValues: {
      name: initialValues?.name || "",
      groupId: initialValues?.groupId,
    },
    onSubmit: ({ value }) => {
      if (onSave) {
        onSave({
          ...initialValues,
          name: value.name.trim(),
          groupId: value.groupId,
        } as ShoppingList);
      }
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
      <DialogContent
        ref={contentRef}
        className="w-full max-w-md mx-auto p-4 sm:p-6"
      >
        <DialogHeader>
          <DialogTitle className="text-xl">
            {t("shoppingLists.shoppingListDetailForm.editShoppingList")}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
          className="space-y-4 mt-4"
        >
          <form.Field
            name="name"
            validators={{
              onChange: ({ value }) => validateName(value),
            }}
          >
            {(field) => (
              <FormField
                name="name"
                label={t("shoppingLists.shoppingListDetailForm.listName")}
                error={field.state.meta.errors?.[0]}
              >
                <Input
                  ref={nameInputRef}
                  id="name"
                  placeholder={t(
                    "shoppingLists.shoppingListDetailForm.listNamePlaceholder",
                  )}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  autoFocus
                />
              </FormField>
            )}
          </form.Field>

          <form.Field name="groupId">
            {(field) => (
              <FormField
                name="group"
                label={t("shoppingLists.shoppingListDetailForm.shareWithGroup")}
                error={field.state.meta.errors?.[0]}
              >
                <div className="relative">
                  {loadingGroups ? (
                    <div className="flex items-center space-x-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      <span className="text-sm text-muted-foreground">
                        {t(
                          "shoppingLists.shoppingListDetailForm.loadingGroups",
                        )}
                      </span>
                    </div>
                  ) : userGroups.length === 0 ? (
                    <div className="text-sm text-muted-foreground flex items-center space-x-2">
                      <Users className="h-4 w-4" />
                      <span>
                        {t("shoppingLists.shoppingListDetailForm.noGroups")}
                      </span>
                    </div>
                  ) : (
                    <Select
                      value={field.state.value || "none"}
                      onValueChange={(value) =>
                        field.handleChange(value === "none" ? "" : value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={t(
                            "shoppingLists.shoppingListDetailForm.selectGroup",
                          )}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {(!initialValues?.groupId ||
                          initialValues.groupId === "") && (
                          <SelectItem value="none">
                            {t("shoppingLists.shoppingListDetailForm.personal")}
                          </SelectItem>
                        )}
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

          <DialogFooter className="flex gap-2 mt-6">
            <Button type="button" variant="outline" onClick={handleCancel}>
              {t("shoppingLists.shoppingListDetailForm.cancel")}
            </Button>
            <Button type="submit" disabled={form.state.canSubmit === false}>
              {t("shoppingLists.shoppingListDetailForm.saveChanges")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
