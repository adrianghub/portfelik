import { COLLECTIONS, FirestoreService } from "@/lib/firebase/firestore";
import type { ShoppingList } from "@/modules/shopping-lists/shopping-list";
import {
  doc,
  getDoc,
  getFirestore,
  orderBy,
  QueryConstraint,
  where,
} from "firebase/firestore";

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

  async getSharedShoppingLists(userId: string): Promise<ShoppingList[]> {
    try {
      const db = getFirestore();

      const userRef = doc(db, COLLECTIONS.USERS, userId);
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) {
        return [];
      }

      const userData = userDoc.data();
      const userGroupIds = userData.groupIds || [];

      if (userGroupIds.length === 0) {
        return [];
      }

      // Query shopping lists that have a groupId matching one of the user's groups
      // This ensures we only get lists that are explicitly shared with a group the user is in
      const constraints: QueryConstraint[] = [
        where("groupId", "in", userGroupIds),
        where("userId", "!=", userId),
        orderBy("userId"),
        orderBy("updatedAt", "desc"),
      ];

      return this.query(constraints);
    } catch (error) {
      console.error("Error fetching shared shopping lists:", error);
      return [];
    }
  }

  async getAllUserShoppingLists(userId: string): Promise<ShoppingList[]> {
    try {
      const ownLists = await this.getUserShoppingLists(userId);
      const sharedLists = await this.getSharedShoppingLists(userId);

      const allLists = [...ownLists, ...sharedLists];
      allLists.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );

      return allLists;
    } catch (error) {
      console.error("Error fetching all user shopping lists:", error);
      return [];
    }
  }

  async getAllActiveShoppingLists(userId: string): Promise<ShoppingList[]> {
    const allLists = await this.getAllUserShoppingLists(userId);
    return allLists.filter((list) => list.status === "active");
  }

  async getAllCompletedShoppingLists(userId: string): Promise<ShoppingList[]> {
    const allLists = await this.getAllUserShoppingLists(userId);
    return allLists.filter((list) => list.status === "completed");
  }

  async createWithGroup(
    shoppingList: Omit<ShoppingList, "id">,
    groupId?: string,
  ): Promise<ShoppingList> {
    const listWithGroup = groupId ? { ...shoppingList, groupId } : shoppingList;
    return this.create(listWithGroup);
  }
}

export const shoppingListService = new ShoppingListService();
