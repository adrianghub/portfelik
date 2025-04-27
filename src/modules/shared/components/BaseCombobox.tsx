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
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, X } from "lucide-react";

interface BaseComboboxProps<T> {
  inputValue: string;
  setInputValue: (value: string) => void;
  placeholder: string;
  inputRef: React.RefObject<HTMLInputElement>;
  handleClearSearch: () => void;
  filteredItems: T[];
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
  filteredItems,
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
  console.log(isLoading);

  return (
    <Command>
      <div className="relative">
        <CommandInput
          ref={inputRef}
          placeholder={placeholder}
          value={inputValue}
          onValueChange={setInputValue}
          className="pr-8"
          aria-label={placeholder}
          onKeyDown={keyboardEventHandler}
          disabled={isLoading}
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
        {isLoading ? (
          <Skeleton className="w-[90%] h-5 my-5 mx-auto" />
        ) : (
          <>
            {filteredItems.length === 0 && !inputValue ? (
              <CommandEmpty>{noItemsMessage}</CommandEmpty>
            ) : filteredItems.length === 0 && inputValue ? (
              <>
                <CommandEmpty>{noMatchingItemsMessage}</CommandEmpty>
                <Button
                  variant="ghost"
                  onClick={onCreateNew}
                  className="w-full"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {createNewButtonText}
                </Button>
              </>
            ) : (
              <CommandGroup>
                {filteredItems.map((item, index) => {
                  const itemValue =
                    typeof item === "object" && item !== null && "id" in item
                      ? String(item.id)
                      : typeof item === "string"
                        ? item
                        : `item-${index}`;

                  return (
                    <CommandItem
                      key={itemValue}
                      value={itemValue}
                      onSelect={() => onSelectItem(item)}
                    >
                      {renderItem(item, selectedItem === item)}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
            {filteredItems.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem className="text-primary" onSelect={onCreateNew}>
                    <Plus className="mr-2 h-4 w-4" />
                    {createNewButtonText}
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </>
        )}
      </CommandList>
    </Command>
  );
}
