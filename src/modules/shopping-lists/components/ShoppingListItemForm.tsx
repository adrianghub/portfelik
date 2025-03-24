import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createShoppingListItem,
  type ShoppingListItem,
} from "@/modules/shopping-lists/shopping-list";
import { PlusIcon } from "lucide-react";
import { useState } from "react";

interface ShoppingListItemFormProps {
  onAddItem: (item: ShoppingListItem) => void;
}

export function ShoppingListItemForm({ onAddItem }: ShoppingListItemFormProps) {
  const [itemName, setItemName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!itemName.trim()) {
      setError("Item name is required");
      return;
    }

    const newItem = createShoppingListItem(itemName.trim());
    onAddItem(newItem);
    setItemName("");
    setError(null);
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center space-x-2">
      <div className="flex-1">
        <Input
          placeholder="Add new item..."
          value={itemName}
          onChange={(e) => {
            setItemName(e.target.value);
            if (error) setError(null);
          }}
          className={error ? "border-red-500" : ""}
        />
        {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
      </div>
      <Button type="submit" size="icon" variant="outline">
        <PlusIcon className="h-4 w-4" />
      </Button>
    </form>
  );
}
