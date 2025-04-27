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
 * Converts a UI Category to a Firestore Category
 */
export function uiCategoryToFirestoreCategory(
  category: Category,
  userId?: string,
): Omit<CategoryDTO, "id"> {
  const firestoreCategory: Omit<CategoryDTO, "id"> = {
    name: category.name,
    type: category.type,
    userId: userId || category.userId || null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return firestoreCategory;
}
