import { COLLECTIONS, FirestoreService } from "@/lib/firebase/firestore";
import type { ShoppingList } from "@/modules/shopping-lists/shopping-list";
import { orderBy, QueryConstraint, where } from "firebase/firestore";

export class ShoppingListService extends FirestoreService<ShoppingList> {
  constructor() {
    super(COLLECTIONS.SHOPPING_LISTS);
  }

  async get(id: string): Promise<ShoppingList | null> {
    return this.getById(id);
  }

  async create(shoppingList: Omit<ShoppingList, "id">): Promise<ShoppingList> {
    return super.create(shoppingList);
  }

  async update(
    id: string,
    shoppingList: Partial<ShoppingList>,
  ): Promise<ShoppingList> {
    const updateData = {
      ...shoppingList,
      updatedAt: new Date().toISOString(),
    };

    return super.update(id, updateData);
  }

  async delete(id: string): Promise<void> {
    return super.delete(id);
  }

  async getUserShoppingLists(userId: string): Promise<ShoppingList[]> {
    const constraints: QueryConstraint[] = [
      where("userId", "==", userId),
      orderBy("updatedAt", "desc"),
    ];

    return this.query(constraints);
  }

  async getAllShoppingLists(): Promise<ShoppingList[]> {
    const constraints: QueryConstraint[] = [orderBy("updatedAt", "desc")];

    return this.query(constraints);
  }

  async getActiveShoppingLists(): Promise<ShoppingList[]> {
    const constraints: QueryConstraint[] = [
      where("status", "==", "active"),
      orderBy("updatedAt", "desc"),
    ];

    return this.query(constraints);
  }

  async getCompletedShoppingLists(): Promise<ShoppingList[]> {
    const constraints: QueryConstraint[] = [
      where("status", "==", "completed"),
      orderBy("updatedAt", "desc"),
    ];
    return this.query(constraints);
  }

  async completeShoppingList(
    id: string,
    totalAmount: number,
    categoryId: string,
    linkedTransactionId?: string,
  ): Promise<ShoppingList> {
    return this.update(id, {
      status: "completed",
      totalAmount,
      categoryId,
      linkedTransactionId,
    });
  }
}

export const shoppingListService = new ShoppingListService();
