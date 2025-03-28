import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/styling-utils";
import type { Category } from "@/modules/shared/category";
import { Check, ChevronsUpDown, X } from "lucide-react";
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

export function CategoryCombobox({
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

  return (
    <div className="w-full">
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
                      onSelect={(currentValue) => {
                        const selected = categories.find(
                          (cat) => cat.name === currentValue,
                        );
                        if (selected) {
                          onValueChange(
                            selected.id === value ? "" : selected.id,
                          );
                          setOpen(false);
                          setInputValue("");
                        }
                      }}
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
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
