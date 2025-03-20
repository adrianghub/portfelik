import { Button } from "@/components/ui/button";
import { Plus, RefreshCw } from "lucide-react";

interface TransactionHeaderButtonsProps {
  handleRefresh: () => void;
  handleOpenDialog: () => void;
  isLoading: boolean;
}

export function TransactionHeaderButtons({
  handleRefresh,
  handleOpenDialog,
  isLoading,
}: TransactionHeaderButtonsProps) {
  return (
    <>
      <Button
        onClick={handleRefresh}
        disabled={isLoading}
        variant="outline"
        className="flex items-center gap-1"
      >
        <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
        <span className="hidden sm:inline">Refresh</span>
      </Button>
      <Button
        onClick={() => handleOpenDialog()}
        className="flex items-center gap-1"
      >
        <Plus className="h-4 w-4" />
        <span className="hidden sm:inline">Add Transaction</span>
        <span className="sm:hidden">Add</span>
      </Button>
    </>
  );
}
