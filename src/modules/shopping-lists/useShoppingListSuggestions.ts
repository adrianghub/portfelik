import { useMemo } from "react";
import { useShoppingLists } from "./useShoppingListsQuery";

interface ItemSuggestion {
  name: string;
  quantity?: number;
  unit?: string;
  frequency: number;
}

export function useShoppingListSuggestions() {
  const { data: shoppingLists = [] } = useShoppingLists();

  const suggestions = useMemo(() => {
    const allItems = shoppingLists.flatMap((list) => list.items);

    const itemMap = new Map<string, ItemSuggestion>();

    allItems.forEach((item) => {
      const existing = itemMap.get(item.name.toLowerCase());
      if (existing) {
        existing.frequency += 1;

        if (
          item.quantity &&
          (!existing.quantity || item.quantity > existing.quantity)
        ) {
          existing.quantity = item.quantity;
        }

        if (item.unit && (!existing.unit || existing.unit === item.unit)) {
          existing.unit = item.unit;
        }
      } else {
        itemMap.set(item.name.toLowerCase(), {
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          frequency: 1,
        });
      }
    });

    return Array.from(itemMap.values()).sort(
      (a, b) => b.frequency - a.frequency,
    );
  }, [shoppingLists]);

  const getSuggestions = (query: string): ItemSuggestion[] => {
    if (!query) return suggestions.slice(0, 5);

    const normalizedQuery = query.toLowerCase();
    return suggestions
      .filter((item) => item.name.toLowerCase().includes(normalizedQuery))
      .slice(0, 5);
  };

  return {
    suggestions,
    getSuggestions,
  };
}
