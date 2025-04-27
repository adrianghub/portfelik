import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, X } from "lucide-react";
import { useCallback, useState } from "react"; // Import useEffect

interface BaseComboboxProps<T> {
  inputValue: string;
  setInputValue: (value: string) => void;
  placeholder: string;
  inputRef: React.RefObject<HTMLInputElement>;
  handleClearSearch: () => void;
  items: T[];
  selectedItem: T | undefined;
  onSelectItem: (item: T) => void;
  onCreateNew: () => void;
  t: (key: string) => string;
  renderItem: (item: T, isSelected: boolean) => React.ReactNode;
  noItemsMessage: string;
  noMatchingItemsMessage: string;
  createNewButtonText: string;
  keyboardEventHandler?: (e: React.KeyboardEvent) => void;
  isLoading?: boolean;
}

export function BaseCombobox<T>({
  inputValue,
  setInputValue,
  placeholder,
  inputRef,
  handleClearSearch,
  items,
  selectedItem,
  onSelectItem,
  onCreateNew,
  t,
  renderItem,
  noItemsMessage,
  noMatchingItemsMessage,
  createNewButtonText,
  keyboardEventHandler,
  isLoading,
}: BaseComboboxProps<T>) {
  const [filteredItemsEmpty, setFilteredItemsEmpty] = useState(false);

  const handleFilterChange = useCallback(
    (value: string) => {
      if (!value) {
        setFilteredItemsEmpty(false);
        return;
      }

      const hasMatches = items.some((item) => {
        const itemName =
          typeof item === "object" && item !== null && "name" in item
            ? String(item.name).toLowerCase()
            : typeof item === "string"
              ? item.toLowerCase()
              : "";

        return itemName.includes(value.toLowerCase());
      });

      setFilteredItemsEmpty(!hasMatches);
    },
    [items],
  );

  return (
    <Command>
      <div className="relative">
        <CommandInput
          ref={inputRef}
          placeholder={placeholder}
          value={inputValue}
          onValueChange={(value) => {
            setInputValue(value);
            handleFilterChange(value);
          }}
          className="pr-8"
          aria-label={placeholder}
          onKeyDown={keyboardEventHandler}
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
      <CommandList>
        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-4 space-y-2">
            <Skeleton className="w-full h-8" />
            <Skeleton className="w-full h-8" />
            <Skeleton className="w-3/4 h-8" />
            <p className="text-xs text-muted-foreground mt-1">Loading...</p>
          </div>
        ) : items.length === 0 && !inputValue ? (
          <CommandEmpty>{noItemsMessage}</CommandEmpty>
        ) : (
          <CommandGroup>
            {items.map((item, index) => {
              const { itemId, itemName } = getItemProps(item, index);
              return (
                <CommandItem
                  key={itemId}
                  value={itemName}
                  onSelect={() => onSelectItem(item)}
                  className="cursor-pointer"
                >
                  {renderItem(item, selectedItem === item)}
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}
        {inputValue && filteredItemsEmpty && (
          <CommandEmpty>{noMatchingItemsMessage}</CommandEmpty>
        )}
      </CommandList>
      <Separator />
      <Button variant="ghost" onClick={onCreateNew}>
        <Plus className="mr-2 h-4 w-4" />
        {createNewButtonText}
      </Button>
    </Command>
  );
}

const getItemProps = <T,>(item: T, index: number) => {
  const itemId =
    typeof item === "object" && item !== null && "id" in item
      ? String(item.id)
      : `item-${index}`;

  const itemName =
    typeof item === "object" && item !== null && "name" in item
      ? String(item.name)
      : typeof item === "string"
        ? item
        : `Item ${index}`;

  return { itemId, itemName };
};
