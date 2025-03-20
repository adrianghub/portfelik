import { Button } from "@/components/ui/button";
import { Trash2, X } from "lucide-react";
import { useState } from "react";
import { DateRange, DateRangeFilter } from "./DateRangeFilter";
import { DeleteTransactionDialog } from "./DeleteTransactionDialog";

interface TableFiltersProps {
  onDateRangeChange: (dateRange: DateRange) => void;
  rowSelection: Record<string, boolean>;
  onBulkDelete: () => void;
  onUnselectAll: () => void;
}

export function TableFilters({
  onDateRangeChange,
  rowSelection,
  onBulkDelete,
  onUnselectAll,
}: TableFiltersProps) {
  const [isDeleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const handleBulkDelete = () => {
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    onBulkDelete();
    setDeleteDialogOpen(false);
  };

  return (
    <div className="flex items-center gap-2">
      <DateRangeFilter onDateRangeChange={onDateRangeChange} />
      {Object.keys(rowSelection).some((key) => rowSelection[key]) && (
        <div className="flex space-x-2">
          <Button
            onClick={handleBulkDelete}
            disabled={Object.keys(rowSelection).length === 0}
            variant="destructive"
            className="flex items-center"
          >
            <Trash2 />
            <span className="hidden lg:inline">Delete Selected</span>
          </Button>
          <Button onClick={onUnselectAll} className="hidden sm:flex">
            <X />
            <span className="hidden lg:inline">Unselect All</span>
          </Button>
        </div>
      )}
      <DeleteTransactionDialog
        open={isDeleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
