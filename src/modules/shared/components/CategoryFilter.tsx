import { Button } from "@/components/ui/button";
import { cn } from "@/lib/styling-utils";
import type { Category } from "@/modules/shared/category";
import { CategoryCombobox } from "@/modules/shared/components/CategoryCombobox";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

interface CategoryFilterProps {
  categories: Category[];
  selectedCategoryId: string;
  onCategoryChange: (categoryId: string) => void;
  isLoading?: boolean;
  label?: string;
  className?: string;
  comboboxPlaceholder?: string;
  clearFilterLabel?: string;
}

export function CategoryFilter({
  categories,
  selectedCategoryId,
  onCategoryChange,
  isLoading = false,
  label,
  className,
  comboboxPlaceholder,
  clearFilterLabel,
}: CategoryFilterProps) {
  const { t } = useTranslation();

  const defaultPlaceholder = t("transactions.filterByCategory");
  const defaultClearLabel = t("transactions.clearCategoryFilter");

  const handleClearFilter = () => {
    onCategoryChange("all");
  };

  return (
    <div className={cn("flex items-center gap-2 w-full sm:w-auto", className)}>
      {label && (
        <span className="text-sm font-medium hidden sm:inline">{label}</span>
      )}
      <div className="flex-grow">
        <CategoryCombobox
          categories={categories}
          value={selectedCategoryId}
          onValueChange={onCategoryChange}
          isLoading={isLoading}
          placeholder={comboboxPlaceholder || defaultPlaceholder}
          createNewCategory={true}
        />
      </div>
      {selectedCategoryId !== "all" && (
        <Button
          variant="ghost"
          onClick={handleClearFilter}
          size="sm"
          title={clearFilterLabel || defaultClearLabel}
        >
          <span className="hidden sm:inline">
            {clearFilterLabel || defaultClearLabel}
          </span>
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
