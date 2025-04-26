import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/styling-utils";
import type { Category } from "@/modules/shared/category";
import { BaseCombobox } from "@/modules/shared/components/BaseCombobox";
import { CreateCategoryDialog } from "@/modules/shared/components/CreateCategoryDialog";
import { Check, ChevronsUpDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

interface CategoryComboboxProps {
  categories: Category[];
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

function CategoryComboboxMobile({
  categories,
  value,
  onValueChange,
  placeholder,
  className,
  disabled = false,
}: CategoryComboboxProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const defaultPlaceholder = t(
    "transactions.transactionDialog.form.categoryPlaceholder",
  );

  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === value),
    [categories, value],
  );

  const displayValue = selectedCategory
    ? selectedCategory.name
    : placeholder || defaultPlaceholder;

  const filteredCategories = useMemo(() => {
    if (!inputValue) {
      return categories;
    }
    const lowercasedInput = inputValue.toLowerCase();
    return categories.filter((category) =>
      category.name.toLowerCase().includes(lowercasedInput),
    );
  }, [categories, inputValue]);

  const handleSelectCategory = (category: Category) => {
    onValueChange(category.id === value ? "" : category.id);
    setOpen(false);
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
    setOpen(false);
    setInputValue(""); // Clear input after creation
  };

  const renderCategoryItem = (category: Category, isSelected: boolean) => (
    <>
      <Check
        className={cn("mr-2 h-4 w-4", isSelected ? "opacity-100" : "opacity-0")}
      />
      {category.name}
    </>
  );

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  return (
    <div className="w-full">
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{defaultPlaceholder}</DrawerTitle>
          </DrawerHeader>
          <div className="p-4">
            <BaseCombobox
              inputValue={inputValue}
              setInputValue={setInputValue}
              placeholder={defaultPlaceholder}
              inputRef={inputRef as React.RefObject<HTMLInputElement>}
              handleClearSearch={handleClearSearch}
              filteredItems={filteredCategories}
              selectedItem={selectedCategory}
              onSelectItem={handleSelectCategory}
              onCreateNew={handleCreateNew}
              t={t}
              renderItem={renderCategoryItem}
              noItemsMessage={t(
                "transactions.transactionDialog.form.noCategories",
              )}
              noMatchingItemsMessage={t(
                "transactions.transactionDialog.form.noMatchingCategories",
              )}
              createNewButtonText={t(
                "transactions.transactionDialog.form.createNewCategory",
              )}
            />
          </div>
        </DrawerContent>
      </Drawer>
      <Button
        id="category-combobox"
        variant="outline"
        role="combobox"
        aria-expanded={open}
        aria-controls="category-list"
        className={cn("w-full justify-between", className)}
        disabled={disabled}
        type="button"
        onClick={() => setOpen(true)}
      >
        {displayValue}
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>
      <CreateCategoryDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCategoryCreated={handleCategoryCreated}
        categoryName={inputValue}
      />
    </div>
  );
}

function CategoryComboboxDesktop({
  categories,
  value,
  onValueChange,
  placeholder,
  className,
  disabled = false,
}: CategoryComboboxProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const defaultPlaceholder = t(
    "transactions.transactionDialog.form.categoryPlaceholder",
  );

  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === value),
    [categories, value],
  );

  const displayValue = selectedCategory
    ? selectedCategory.name
    : placeholder || defaultPlaceholder;

  const filteredCategories = useMemo(() => {
    if (!inputValue) {
      return categories;
    }
    const lowercasedInput = inputValue.toLowerCase();
    return categories.filter((category) =>
      category.name.toLowerCase().includes(lowercasedInput),
    );
  }, [categories, inputValue]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !open) {
      e.preventDefault();
      setOpen(true);
    }
    if (e.key === "Escape") {
      setOpen(false);
      setInputValue("");
    }
  };

  const handleSelectCategory = (category: Category) => {
    onValueChange(category.id === value ? "" : category.id);
    setOpen(false);
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
    setOpen(false);
    setInputValue(""); // Clear input after creation
  };

  const renderCategoryItem = (category: Category, isSelected: boolean) => (
    <>
      <Check
        className={cn("mr-2 h-4 w-4", isSelected ? "opacity-100" : "opacity-0")}
      />
      {category.name}
    </>
  );

  // Effect to focus the input when the popover is open
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  return (
    <div className="w-full sm:w-auto">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id="category-combobox"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-controls="category-list"
            className={cn("w-full justify-between", className)}
            disabled={disabled}
            onKeyDown={handleKeyDown}
          >
            {displayValue}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[--radix-popover-trigger-width] p-0"
          align="start"
          sideOffset={4}
        >
          <BaseCombobox
            inputValue={inputValue}
            setInputValue={setInputValue}
            placeholder={defaultPlaceholder}
            inputRef={inputRef as React.RefObject<HTMLInputElement>}
            handleClearSearch={handleClearSearch}
            filteredItems={filteredCategories}
            selectedItem={selectedCategory}
            onSelectItem={handleSelectCategory}
            onCreateNew={handleCreateNew}
            t={t}
            renderItem={renderCategoryItem}
            noItemsMessage={t(
              "transactions.transactionDialog.form.noCategories",
            )}
            noMatchingItemsMessage={t(
              "transactions.transactionDialog.form.noMatchingCategories",
            )}
            createNewButtonText={t(
              "transactions.transactionDialog.form.createNewCategory",
            )}
            keyboardEventHandler={handleKeyDown}
          />
        </PopoverContent>
      </Popover>
      <CreateCategoryDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCategoryCreated={handleCategoryCreated}
        categoryName={inputValue}
      />
    </div>
  );
}

export function CategoryCombobox(props: CategoryComboboxProps) {
  const isMobile = useMediaQuery("(max-width: 768px)");
  return isMobile ? (
    <CategoryComboboxMobile {...props} />
  ) : (
    <CategoryComboboxDesktop {...props} />
  );
}
