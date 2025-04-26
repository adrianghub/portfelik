import { COLLECTIONS, FirestoreService } from "@/lib/firebase/firestore";
import type { Category } from "@/modules/shared/category";
import {
  doc,
  getDoc,
  getFirestore,
  orderBy,
  QueryConstraint,
  where,
} from "firebase/firestore";

export class CategoryService extends FirestoreService<Category> {
  constructor() {
    super(COLLECTIONS.CATEGORIES);
  }

  async get(id: string): Promise<Category | null> {
    return this.getById(id);
  }

  async create(category: Omit<Category, "id">): Promise<Category> {
    return super.create(category);
  }

  async update(id: string, updates: Partial<Category>): Promise<Category> {
    return super.update(id, updates);
  }

  async delete(id: string): Promise<void> {
    return super.delete(id);
  }

  async getAllCategories(): Promise<Category[]> {
    return this.getAll();
  }

  async getUserCategories(userId: string): Promise<Category[]> {
    const constraints: QueryConstraint[] = [
      where("userId", "==", userId),
      orderBy("name", "asc"),
    ];
    return this.query(constraints);
  }

  async getSharedCategories(userId: string): Promise<Category[]> {
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

      const memberIds = new Set<string>();

      for (const groupId of userGroupIds) {
        const groupRef = doc(db, COLLECTIONS.USER_GROUPS, groupId);
        const groupDoc = await getDoc(groupRef);

        if (groupDoc.exists()) {
          const groupData = groupDoc.data();

          if (groupData.memberIds) {
            groupData.memberIds.forEach((memberId: string) => {
              if (memberId !== userId) {
                memberIds.add(memberId);
              }
            });
          }
        }
      }

      if (memberIds.size === 0) {
        return [];
      }

      const memberIdsArray = Array.from(memberIds);

      const constraints: QueryConstraint[] = [
        where("userId", "in", memberIdsArray),
        orderBy("name", "asc"),
      ];

      return this.query(constraints);
    } catch (error) {
      console.error("Error fetching shared categories:", error);
      return [];
    }
  }

  async getAllUserCategories(userId: string): Promise<Category[]> {
    try {
      const ownCategories = await this.getUserCategories(userId);
      const sharedCategories = await this.getSharedCategories(userId);

      const allCategories = [...ownCategories, ...sharedCategories];
      const uniqueCategories = Array.from(
        new Map(
          allCategories.map((cat) => [cat.name.toLowerCase(), cat]),
        ).values(),
      );

      uniqueCategories.sort((a, b) => a.name.localeCompare(b.name));

      return uniqueCategories;
    } catch (error) {
      console.error("Error fetching all user categories:", error);
      return [];
    }
  }
}

export const categoryService = new CategoryService();
