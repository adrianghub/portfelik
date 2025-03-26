import { COLLECTIONS, FirestoreService } from "@/lib/firebase/firestore";
import type { Category } from "@/modules/shared/category";

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
}

export const categoryService = new CategoryService();
