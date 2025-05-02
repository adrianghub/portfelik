import type { Category } from "@/modules/shared/category";
import { useMemo, useRef, useState } from "react";

interface UseCategoryComboboxProps {
  categories: Category[];
  value?: string;
  onValueChange: (value: string) => void;
}

export function useCategoryCombobox({
  categories,
  value,
  onValueChange,
}: UseCategoryComboboxProps) {
  const [inputValue, setInputValue] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === value),
    [categories, value],
  );

  const handleSelectCategory = (category: Category) => {
    onValueChange(category.id === value ? "" : category.id);
    setInputValue("");
  };

  const handleClearSearch = () => {
    setInputValue("");
    inputRef.current?.focus();
  };

  const handleCreateNew = () => {
    setCreateDialogOpen(true);
  };

  const handleCategoryCreated = (categoryId: string) => {
    onValueChange(categoryId);
    setCreateDialogOpen(false);
    setInputValue("");
  };

  return {
    inputValue,
    setInputValue,
    createDialogOpen,
    setCreateDialogOpen,
    inputRef,
    selectedCategory,
    handleSelectCategory,
    handleClearSearch,
    handleCreateNew,
    handleCategoryCreated,
  };
}
