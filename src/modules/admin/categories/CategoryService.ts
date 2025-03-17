import type { Category } from "@/modules/shared/category";
import { orderBy, QueryConstraint } from "firebase/firestore";
import { COLLECTIONS, FirestoreService } from "../../../lib/firebase/firestore";

// Extended UserData interface to ensure it has an id property

// User service

// Category service
export class CategoryService extends FirestoreService<Category> {
  constructor() {
    super(COLLECTIONS.CATEGORIES);
  }

  // Create a new category
  async create(category: Omit<Category, "id">): Promise<Category> {
    console.log("Creating category:", category);
    return super.create(category);
  }

  // Update a category
  async update(id: string, updates: Partial<Category>): Promise<Category> {
    return super.update(id, updates);
  }

  // Delete a category
  async delete(id: string): Promise<void> {
    return super.delete(id);
  }

  async getAllCategories(): Promise<Category[]> {
    const constraints: QueryConstraint[] = [orderBy("name", "asc")];

    return this.query(constraints);
  }
}

export const categoryService = new CategoryService();
