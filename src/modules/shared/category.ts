export interface Category {
  id: string;
  name: string;
  type: "income" | "expense";
  userId?: string | null;
}

export interface CategoryDTO extends Category {
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Converts a Firestore Category to a UI Category
 */
export function firestoreCategoryToUICategory(category: CategoryDTO): Category {
  const uiCategory: Category = {
    id: category.id || "",
    name: category.name,
    type: category.type,
    userId: category.userId,
  };
  return uiCategory;
}

/**
 * Converts an array of Firestore Categories to UI Categories
 */
export function firestoreCategoriesToUICategories(
  categories: CategoryDTO[],
): Category[] {
  const uiCategories = categories.map(firestoreCategoryToUICategory);
  return uiCategories;
}

/**
 * Converts a UI Category to a Firestore Category
 */
export function uiCategoryToFirestoreCategory(
  category: Category,
  userId?: string,
): Omit<Category, "id"> {
  // Return a plain category object with userId set
  const firestoreCategory: Omit<Category, "id"> = {
    name: category.name,
    type: category.type,
    userId: userId || category.userId || null,
  };

  return firestoreCategory;
}
