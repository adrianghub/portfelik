import { Category as UICategory } from "@/components/transactions/CategorySelect";
import { Category as FirestoreCategory } from "@/lib/services";

/**
 * Converts a Firestore Category to a UI Category
 */
export function firestoreCategoryToUICategory(
  category: FirestoreCategory,
): UICategory {
  console.log("Converting Firestore category to UI category:", category);
  const uiCategory: UICategory = {
    id: category.id || "",
    name: category.name,
    type: category.type,
  };
  console.log("Converted UI category:", uiCategory);
  return uiCategory;
}

/**
 * Converts an array of Firestore Categories to UI Categories
 */
export function firestoreCategoriesToUICategories(
  categories: FirestoreCategory[],
): UICategory[] {
  console.log("Converting Firestore categories to UI categories:", categories);
  const uiCategories = categories.map(firestoreCategoryToUICategory);
  console.log("Converted UI categories:", uiCategories);
  return uiCategories;
}

/**
 * Converts a UI Category to a Firestore Category
 */
export function uiCategoryToFirestoreCategory(
  category: UICategory,
  userId?: string,
): Omit<FirestoreCategory, "id" | "createdAt" | "updatedAt"> {
  console.log("Converting UI category to Firestore category:", category);
  const firestoreCategory = {
    name: category.name,
    type: category.type,
    userId: userId || null,
  };
  console.log("Converted Firestore category:", firestoreCategory);
  return firestoreCategory;
}
