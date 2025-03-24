export type ShoppingListStatus = "active" | "completed";

export interface ShoppingListItem {
  id: string;
  name: string;
  completed: boolean;
  quantity?: number;
  unit?: string;
}

export interface ShoppingList {
  id?: string;
  name: string;
  items: ShoppingListItem[];
  createdAt: string;
  updatedAt: string;
  status: ShoppingListStatus;
  userId: string;
  totalAmount?: number;
  categoryId?: string;
  linkedTransactionId?: string;
}

export function createShoppingListItem(
  name: string,
  quantity?: number,
  unit?: string,
): ShoppingListItem {
  return {
    id: crypto.randomUUID(),
    name,
    completed: false,
    ...(quantity !== undefined && { quantity }),
    ...(unit !== undefined && { unit }),
  };
}

export function createShoppingList(
  name: string,
  userId: string,
): Omit<ShoppingList, "id"> {
  const now = new Date().toISOString();
  return {
    name,
    items: [],
    createdAt: now,
    updatedAt: now,
    status: "active",
    userId,
  };
}
