import { addDoc, collection, doc, getDocs, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase/firebase";

// Default categories with simplified structure
const DEFAULT_CATEGORIES = [
  // Income categories
  { name: "Salary", type: "income", isDefault: true },
  { name: "Freelance", type: "income", isDefault: true },
  { name: "Investment", type: "income", isDefault: true },
  { name: "Gift", type: "income", isDefault: true },

  // Expense categories
  { name: "Food & Groceries", type: "expense", isDefault: true },
  { name: "Housing & Rent", type: "expense", isDefault: true },
  { name: "Utilities", type: "expense", isDefault: true },
  { name: "Transportation", type: "expense", isDefault: true },
  { name: "Entertainment", type: "expense", isDefault: true },
  { name: "Healthcare", type: "expense", isDefault: true },
  { name: "Education", type: "expense", isDefault: true },
  { name: "Shopping", type: "expense", isDefault: true },
  { name: "Travel", type: "expense", isDefault: true },
];

// Sample transactions for test user
const SAMPLE_TRANSACTIONS = [
  {
    amount: 5000,
    description: "Monthly Salary",
    categoryId: "salary", // This will be replaced with actual category ID
    date: new Date(2023, 2, 1), // March 1, 2023
  },
  {
    amount: -120,
    description: "Grocery Shopping",
    categoryId: "food", // This will be replaced with actual category ID
    date: new Date(2023, 2, 5), // March 5, 2023
  },
  {
    amount: -50,
    description: "Gas Bill",
    categoryId: "utilities", // This will be replaced with actual category ID
    date: new Date(2023, 2, 10), // March 10, 2023
  },
];

async function seedEmulator() {
  console.log("Starting emulator seeding process...");

  // Create test users
  const testUserId = await createTestUser();
  await createAdminUser(); // Don't store the unused variable

  // Create categories
  const categoryMap = await createCategories();

  // Create transactions for test user
  await createTransactions(testUserId, categoryMap);

  console.log("Emulator seeding completed successfully!");
}

async function createTestUser(): Promise<string> {
  console.log("Creating test user...");
  const userRef = doc(db, "users", "test-user-id");

  await setDoc(userRef, {
    email: "test@example.com",
    role: "user",
    createdAt: new Date(),
    lastLoginAt: new Date(),
  });

  console.log("Test user created with ID:", userRef.id);
  return userRef.id;
}

async function createAdminUser(): Promise<string> {
  console.log("Creating admin user...");
  const userRef = doc(db, "users", "admin-user-id");

  await setDoc(userRef, {
    email: "admin@example.com",
    role: "admin",
    createdAt: new Date(),
    lastLoginAt: new Date(),
  });

  console.log("Admin user created with ID:", userRef.id);
  return userRef.id;
}

async function createCategories(): Promise<Record<string, string>> {
  console.log("Creating default categories...");
  const categoriesRef = collection(db, "categories");
  const categoryMap: Record<string, string> = {};

  // Check if categories already exist
  const querySnapshot = await getDocs(categoriesRef);
  if (!querySnapshot.empty) {
    console.log(
      `Found ${querySnapshot.size} existing categories. Skipping category creation.`,
    );
    return categoryMap;
  }

  const now = new Date();

  for (const category of DEFAULT_CATEGORIES) {
    try {
      const docRef = await addDoc(categoriesRef, {
        ...category,
        userId: null, // null userId for default categories
        createdAt: now,
        updatedAt: now,
      });

      // Store the category ID by its name (lowercase, no spaces)
      const key = category.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      categoryMap[key] = docRef.id;

      console.log(`Added category: ${category.name} with ID: ${docRef.id}`);
    } catch (error) {
      console.error(`Error adding category ${category.name}:`, error);
    }
  }

  return categoryMap;
}

async function createTransactions(
  userId: string,
  categoryMap: Record<string, string>,
): Promise<void> {
  console.log("Creating sample transactions...");
  const transactionsRef = collection(db, "transactions");
  const now = new Date();

  for (const transaction of SAMPLE_TRANSACTIONS) {
    try {
      // Map the category ID placeholder to the actual category ID
      let categoryId = transaction.categoryId;
      if (categoryMap[categoryId]) {
        categoryId = categoryMap[categoryId];
      }

      const docRef = await addDoc(transactionsRef, {
        ...transaction,
        userId,
        categoryId,
        createdAt: now,
        updatedAt: now,
      });

      console.log(
        `Added transaction: ${transaction.description} with ID: ${docRef.id}`,
      );
    } catch (error) {
      console.error(
        `Error adding transaction ${transaction.description}:`,
        error,
      );
    }
  }
}

// Run the seed function
seedEmulator()
  .then(() => {
    console.log("Emulator seed script completed.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error in emulator seed script:", error);
    process.exit(1);
  });
