import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/styling-utils";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useShoppingListSuggestions } from "../hooks/useShoppingListSuggestions";
import type { ShoppingListItem } from "../shopping-list";
import { createShoppingListItem } from "../shopping-list";

interface ShoppingListItemSuggestionsProps {
  query: string;
  onSelectSuggestion: (item: ShoppingListItem) => void;
}

export function ShoppingListItemSuggestions({
  query,
  onSelectSuggestion,
}: ShoppingListItemSuggestionsProps) {
  const { getSuggestions } = useShoppingListSuggestions();
  const [selectedIndex, setSelectedIndex] = useState(-1);

  // Memoize suggestions to prevent unnecessary recalculations
  const suggestions = useMemo(
    () => getSuggestions(query),
    [query, getSuggestions],
  );

  // Reset selected index when query changes
  useEffect(() => {
    setSelectedIndex(-1);
  }, [query]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : prev,
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
      } else if (e.key === "Enter" && selectedIndex >= 0) {
        e.preventDefault();
        const selectedSuggestion = suggestions[selectedIndex];
        onSelectSuggestion(
          createShoppingListItem(
            selectedSuggestion.name,
            selectedSuggestion.quantity,
            selectedSuggestion.unit,
          ),
        );
      }
    },
    [suggestions, selectedIndex, onSelectSuggestion],
  );

  const handleSuggestionClick = useCallback(
    (suggestion: (typeof suggestions)[0]) => {
      onSelectSuggestion(
        createShoppingListItem(
          suggestion.name,
          suggestion.quantity,
          suggestion.unit,
        ),
      );
    },
    [onSelectSuggestion],
  );

  if (suggestions.length === 0) return null;

  return (
    <div className="absolute top-full left-0 right-0 z-50 mt-1">
      <ScrollArea className="h-[120px] rounded-md border bg-background shadow-md">
        <div className="p-1 space-y-0.5" onKeyDown={handleKeyDown}>
          {suggestions.map((suggestion, index) => (
            <Button
              key={suggestion.name}
              variant="ghost"
              className={cn(
                "w-full justify-start text-sm h-8 px-2",
                selectedIndex === index && "bg-accent",
              )}
              onClick={() => handleSuggestionClick(suggestion)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <span className="truncate">{suggestion.name}</span>
              {suggestion.quantity && suggestion.unit && (
                <span className="ml-2 text-muted-foreground whitespace-nowrap text-xs">
                  ({suggestion.quantity} {suggestion.unit})
                </span>
              )}
            </Button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
