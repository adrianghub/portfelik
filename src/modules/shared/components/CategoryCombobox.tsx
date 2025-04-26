import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
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
import { CreateCategoryDialog } from "@/modules/shared/components/CreateCategoryDialog";
import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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

  const selectedCategory = categories.find((category) => category.id === value);
  const defaultPlaceholder = t(
    "transactions.transactionDialog.form.categoryPlaceholder",
  );

  const filteredCategories = categories.filter((category) =>
    category.name.toLowerCase().includes(inputValue.toLowerCase()),
  );

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const handleClearSearch = () => {
    setInputValue("");
    inputRef.current?.focus();
  };

  const handleSelect = (category: Category) => {
    onValueChange(category.id === value ? "" : category.id);
    setOpen(false);
    setInputValue("");
  };

  const handleCreateNew = () => {
    setCreateDialogOpen(true);
  };

  const handleCategoryCreated = (categoryId: string) => {
    onValueChange(categoryId);
    setOpen(false);
    setInputValue("");
  };

  return (
    <div className="w-full">
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>
              {t("transactions.transactionDialog.form.categoryPlaceholder")}
            </DrawerTitle>
          </DrawerHeader>
          <div className="p-4">
            <Command>
              <div className="relative">
                <CommandInput
                  ref={inputRef}
                  placeholder={t(
                    "transactions.transactionDialog.form.categoryPlaceholder",
                  )}
                  value={inputValue}
                  onValueChange={setInputValue}
                  className="pr-8"
                  aria-label={t(
                    "transactions.transactionDialog.form.categoryPlaceholder",
                  )}
                />
                {inputValue && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-2 h-4 w-4 p-0 hover:bg-transparent"
                    onClick={handleClearSearch}
                    aria-label={t("common.clear")}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <div className="mt-4 space-y-1">
                {categories.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    {t("transactions.transactionDialog.form.noCategories")}
                  </div>
                ) : filteredCategories.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    {t(
                      "transactions.transactionDialog.form.noMatchingCategories",
                    )}
                  </div>
                ) : (
                  filteredCategories.map((category) => (
                    <Button
                      key={category.id}
                      variant="ghost"
                      className="w-full justify-start"
                      onClick={() => handleSelect(category)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === category.id ? "opacity-100" : "opacity-0",
                        )}
                      />
                      {category.name}
                    </Button>
                  ))
                )}
                <CommandSeparator />
                <Button
                  variant="ghost"
                  className="w-full justify-start text-primary"
                  onClick={handleCreateNew}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {t("transactions.transactionDialog.form.createNewCategory")}
                </Button>
              </div>
            </Command>
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
        {selectedCategory?.name || placeholder || defaultPlaceholder}
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>
      <CreateCategoryDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCategoryCreated={handleCategoryCreated}
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

  const selectedCategory = categories.find((category) => category.id === value);
  const defaultPlaceholder = t(
    "transactions.transactionDialog.form.categoryPlaceholder",
  );

  const filteredCategories = categories.filter((category) =>
    category.name.toLowerCase().includes(inputValue.toLowerCase()),
  );

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

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

  const handleClearSearch = () => {
    setInputValue("");
    inputRef.current?.focus();
  };

  const handleSelect = (currentValue: string) => {
    if (currentValue === "create-new") {
      setCreateDialogOpen(true);
      return;
    }

    const selected = categories.find((cat) => cat.name === currentValue);
    if (selected) {
      onValueChange(selected.id === value ? "" : selected.id);
      setOpen(false);
      setInputValue("");
    }
  };

  const handleCategoryCreated = (categoryId: string) => {
    setTimeout(() => {
      onValueChange(categoryId);
      setOpen(false);
      setInputValue("");
    }, 0);
  };

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
            {selectedCategory?.name || placeholder || defaultPlaceholder}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[--radix-popover-trigger-width] p-0"
          align="start"
          sideOffset={4}
        >
          <Command>
            <div className="relative">
              <CommandInput
                ref={inputRef}
                placeholder={t(
                  "transactions.transactionDialog.form.categoryPlaceholder",
                )}
                value={inputValue}
                onValueChange={setInputValue}
                onKeyDown={handleKeyDown}
                className="pr-8"
                aria-label={t(
                  "transactions.transactionDialog.form.categoryPlaceholder",
                )}
              />
              {inputValue && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-2 h-4 w-4 p-0 hover:bg-transparent"
                  onClick={handleClearSearch}
                  aria-label={t("common.clear")}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
            <CommandList id="category-list">
              {categories.length === 0 ? (
                <CommandEmpty>
                  {t("transactions.transactionDialog.form.noCategories")}
                </CommandEmpty>
              ) : filteredCategories.length === 0 ? (
                <CommandEmpty>
                  {t(
                    "transactions.transactionDialog.form.noMatchingCategories",
                  )}
                </CommandEmpty>
              ) : (
                <CommandGroup>
                  {filteredCategories.map((category) => (
                    <CommandItem
                      key={category.id}
                      value={category.name}
                      onSelect={handleSelect}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === category.id ? "opacity-100" : "opacity-0",
                        )}
                      />
                      {category.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              <CommandSeparator />
              <CommandGroup>
                <CommandItem
                  value="create-new"
                  className="text-primary"
                  onSelect={handleSelect}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {t("transactions.transactionDialog.form.createNewCategory")}
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <CreateCategoryDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCategoryCreated={handleCategoryCreated}
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
