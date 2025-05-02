import { Button } from "@/components/ui/button";
import { DayjsDate } from "@/lib/date-utils";
import { Trash2, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DateRange, DateRangeFilter } from "./DateRangeFilter";
import { DeleteTransactionDialog } from "./DeleteTransactionDialog";

interface TableFiltersProps {
  startDate: DayjsDate;
  endDate: DayjsDate;
  onDateRangeChange: (dateRange: DateRange) => void;
  rowSelection: Record<string, boolean>;
  onBulkDelete: () => void;
  onUnselectAll: () => void;
}

export function TableFilters({
  startDate,
  endDate,
  onDateRangeChange,
  rowSelection,
  onBulkDelete,
  onUnselectAll,
}: TableFiltersProps) {
  const [isDeleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const { t } = useTranslation();

  const handleBulkDelete = () => {
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    onBulkDelete();
    setDeleteDialogOpen(false);
  };

  return (
    <div className="flex items-center gap-2">
      <DateRangeFilter
        startDate={startDate}
        endDate={endDate}
        onDateRangeChange={onDateRangeChange}
      />
      {Object.keys(rowSelection).some((key) => rowSelection[key]) && (
        <div className="flex space-x-2">
          <Button
            onClick={handleBulkDelete}
            disabled={Object.keys(rowSelection).length === 0}
            variant="destructive"
            className="flex items-center"
          >
            <Trash2 />
            <span className="hidden lg:inline">
              {t("transactions.filters.deleteSelected")}
            </span>
          </Button>
          <Button onClick={onUnselectAll} className="hidden sm:flex">
            <X />
            <span className="hidden lg:inline">
              {t("transactions.filters.unselectAll")}
            </span>
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
