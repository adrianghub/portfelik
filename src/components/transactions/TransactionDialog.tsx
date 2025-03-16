import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import React from "react";
import { TransactionForm } from "./TransactionForm";

export type Transaction = {
  id?: string;
  amount: number;
  description: string;
  date: string;
  type: "income" | "expense";
  category: string;
};

interface TransactionDialogProps {
  trigger?: React.ReactNode;
  onSubmit?: (transaction: Transaction) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function TransactionDialog({
  trigger,
  onSubmit,
  open: controlledOpen,
  onOpenChange,
}: TransactionDialogProps) {
  const [open, setOpen] = React.useState(false);

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : open;
  const setIsOpen = isControlled ? onOpenChange! : setOpen;

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
          <DialogTitle className="text-xl">Add Transaction</DialogTitle>
          <DialogDescription>
            Fill out the form below to add a new transaction.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4">
          <TransactionForm
            onSubmit={handleSave}
            onCancel={() => setIsOpen(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
