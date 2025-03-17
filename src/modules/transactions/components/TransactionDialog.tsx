import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Transaction } from "@/modules/transactions/transaction";
import { useState } from "react";
import { TransactionForm } from "./TransactionForm";

interface TransactionDialogProps {
  trigger?: React.ReactNode;
  onSubmit?: (transaction: Transaction) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  transaction: Transaction | null;
}

export function TransactionDialog({
  trigger,
  onSubmit,
  open: controlledOpen,
  onOpenChange,
  transaction,
}: TransactionDialogProps) {
  const [open, setOpen] = useState(false);

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : open;
  const setIsOpen = isControlled ? onOpenChange! : setOpen;

  const isEditing = !!transaction?.id;

  const handleSave = (transaction: Transaction) => {
    if (onSubmit) {
      onSubmit(transaction);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="w-full max-w-md mx-auto sm:max-w-lg p-4 sm:p-6 overflow-y-auto max-h-[95vh]">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {isEditing ? "Edit Transaction" : "Add Transaction"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the transaction details below."
              : "Fill out the form below to add a new transaction."}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4">
          <TransactionForm
            onSubmit={handleSave}
            onCancel={() => setIsOpen(false)}
            initialValues={transaction}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
