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
import { useCategoryCombobox } from "@/modules/shared/components/useCategoryCombobox";
import { Check, ChevronsUpDown } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

interface CategoryComboboxProps {
  categories: Category[];
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  isLoading?: boolean;
  createNewCategory?: boolean;
}

function CategoryComboboxMobile({
  categories,
  value,
  onValueChange,
  placeholder,
  className,
  isLoading = false,
  createNewCategory,
}: CategoryComboboxProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const {
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
  } = useCategoryCombobox({ categories, value, onValueChange });

  const defaultPlaceholder = t(
    "transactions.transactionDialog.form.categoryPlaceholder",
  );

  const displayValue = selectedCategory
    ? selectedCategory.name
    : placeholder || defaultPlaceholder;

  const onSelectCategory = (category: Category) => {
    handleSelectCategory(category);
    setOpen(false);
  };

  const onCategoryCreated = (categoryId: string) => {
    handleCategoryCreated(categoryId);
    setOpen(false);
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
      const timer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [open, inputRef]);

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
              inputRef={inputRef}
              handleClearSearch={handleClearSearch}
              items={categories}
              selectedItem={selectedCategory}
              onSelectItem={onSelectCategory}
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
              isLoading={isLoading}
              createNewCategory={createNewCategory}
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
        type="button"
        onClick={() => setOpen(true)}
      >
        {displayValue}
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>
      <CreateCategoryDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCategoryCreated={onCategoryCreated}
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
  isLoading = false,
  createNewCategory,
}: CategoryComboboxProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const {
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
  } = useCategoryCombobox({ categories, value, onValueChange });

  const defaultPlaceholder = t(
    "transactions.transactionDialog.form.categoryPlaceholder",
  );

  const displayValue = selectedCategory
    ? selectedCategory.name
    : placeholder || defaultPlaceholder;

  const onSelectCategory = (category: Category) => {
    handleSelectCategory(category);
    setOpen(false);
  };

  const onCategoryCreated = (categoryId: string) => {
    handleCategoryCreated(categoryId);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !open) {
      e.preventDefault();
      setOpen(true);
    } else if (e.key === "Escape") {
      setOpen(false);
      setInputValue("");
    }
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
      const timer = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(timer);
    }
  }, [open, inputRef]);

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
            inputRef={inputRef}
            handleClearSearch={handleClearSearch}
            items={categories}
            selectedItem={selectedCategory}
            onSelectItem={onSelectCategory}
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
            isLoading={isLoading}
            createNewCategory={createNewCategory}
          />
        </PopoverContent>
      </Popover>
      <CreateCategoryDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCategoryCreated={onCategoryCreated}
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
