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
import { useForm } from "@tanstack/react-form";
import { useState } from "react";

interface ShoppingListNameDialogProps {
  trigger?: React.ReactNode;
  onSave: (name: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  initialName: string;
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

export function ShoppingListNameDialog({
  trigger,
  onSave,
  open: controlledOpen,
  onOpenChange,
  initialName,
}: ShoppingListNameDialogProps) {
  const [open, setOpen] = useState(false);

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : open;
  const setIsOpen = isControlled ? onOpenChange! : setOpen;

  const form = useForm({
    defaultValues: {
      name: initialName,
    },
    onSubmit: ({ value }) => {
      if (value.name.trim()) {
        onSave(value.name.trim());
        form.reset();
        setIsOpen(false);
      }
    },
  });

  const handleCancel = () => {
    form.reset();
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="w-full max-w-md mx-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-xl">Edit Shopping List</DialogTitle>
          <DialogDescription>
            Change the name of your shopping list.
          </DialogDescription>
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
                label="List Name"
                error={field.state.meta.errors?.[0]}
              >
                <Input
                  id="name"
                  placeholder="Enter list name"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  autoFocus
                />
              </FormField>
            )}
          </form.Field>

          <DialogFooter className="flex gap-2 mt-6">
            <Button type="button" variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.state.canSubmit === false}>
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
