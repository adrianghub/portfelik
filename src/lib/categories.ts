import { Category } from "@/components/transactions/CategorySelect";

// Default categories - will be moved to Firestore in the future
const DEFAULT_CATEGORIES: Category[] = [
  // Income categories
  { id: "salary", name: "Salary", type: "income" },
  { id: "freelance", name: "Freelance", type: "income" },
  { id: "investment", name: "Investment", type: "income" },
  { id: "gift", name: "Gift", type: "income" },

  // Expense categories
  { id: "food", name: "Food & Groceries", type: "expense" },
  { id: "housing", name: "Housing & Rent", type: "expense" },
  { id: "utilities", name: "Utilities", type: "expense" },
  { id: "transportation", name: "Transportation", type: "expense" },
  { id: "entertainment", name: "Entertainment", type: "expense" },
  { id: "health", name: "Healthcare", type: "expense" },
  { id: "education", name: "Education", type: "expense" },
  { id: "shopping", name: "Shopping", type: "expense" },
  { id: "travel", name: "Travel", type: "expense" },
];

// In-memory cache of categories (temporary until Firestore implementation)
let categoriesCache: Category[] | null = null;

/**
 * Load categories - will be replaced with Firestore fetch
 */
export async function getCategories(): Promise<Category[]> {
  // Simulate network delay (will be replaced with actual Firestore call)
  await new Promise((resolve) => setTimeout(resolve, 200));

  // Return from cache if available
  if (categoriesCache) {
    return categoriesCache;
  }

  // Initialize with default categories (will be replaced with Firestore fetch)
  categoriesCache = [...DEFAULT_CATEGORIES];
  return categoriesCache;
}

/**
 * Add a new category - will be replaced with Firestore add
 */
export async function addCategory(
  category: Omit<Category, "id">,
): Promise<Category[]> {
  // Simulate network delay (will be replaced with actual Firestore call)
  await new Promise((resolve) => setTimeout(resolve, 200));

  const categories = await getCategories();
  const newCategory = {
    ...category,
    id: generateCategoryId(category.name),
  };

  const updatedCategories = [...categories, newCategory];

  // Update local cache (will be replaced with Firestore update)
  categoriesCache = updatedCategories;

  return updatedCategories;
}

/**
 * Update an existing category - will be replaced with Firestore update
 */
export async function updateCategory(
  categoryId: string,
  updates: Partial<Omit<Category, "id">>,
): Promise<Category[]> {
  // Simulate network delay (will be replaced with actual Firestore call)
  await new Promise((resolve) => setTimeout(resolve, 200));

  const categories = await getCategories();
  const updatedCategories = categories.map((category) =>
    category.id === categoryId ? { ...category, ...updates } : category,
  );

  // Update local cache (will be replaced with Firestore update)
  categoriesCache = updatedCategories;

  return updatedCategories;
}

/**
 * Delete a category - will be replaced with Firestore delete
 */
export async function deleteCategory(categoryId: string): Promise<Category[]> {
  // Simulate network delay (will be replaced with actual Firestore call)
  await new Promise((resolve) => setTimeout(resolve, 200));

  const categories = await getCategories();
  const updatedCategories = categories.filter(
    (category) => category.id !== categoryId,
  );

  // Update local cache (will be replaced with Firestore delete)
  categoriesCache = updatedCategories;

  return updatedCategories;
}

/**
 * Generate a unique ID from category name
 * This will be replaced by Firestore auto-generated IDs
 */
function generateCategoryId(name: string): string {
  return `${name.toLowerCase().replace(/\s+/g, "-")}-${Date.now().toString(
    36,
  )}`;
}
