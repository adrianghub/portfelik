import { addDoc, collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase/firebase"; // Import Firebase instance from the main app

// Default categories with simplified structure
const DEFAULT_CATEGORIES = [
  // Income categories
  { name: "Salary", type: "income" },
  { name: "Freelance", type: "income" },
  { name: "Investment", type: "income" },
  { name: "Gift", type: "income" },

  // Expense categories
  { name: "Food & Groceries", type: "expense" },
  { name: "Housing & Rent", type: "expense" },
  { name: "Utilities", type: "expense" },
  { name: "Transportation", type: "expense" },
  { name: "Entertainment", type: "expense" },
  { name: "Healthcare", type: "expense" },
  { name: "Education", type: "expense" },
  { name: "Shopping", type: "expense" },
  { name: "Travel", type: "expense" },
];

async function seedCategories() {
  console.log("Checking for existing categories...");

  // Check if categories already exist
  const categoriesRef = collection(db, "categories");
  const querySnapshot = await getDocs(categoriesRef);

  if (!querySnapshot.empty) {
    console.log(
      `Found ${querySnapshot.size} existing categories. Do you want to add default categories anyway?`,
    );
    // In a real script, you might prompt the user here
    // For now, we'll just proceed with adding
  }

  console.log("Seeding database with default categories...");

  // Add default categories
  const now = new Date();
  const promises = DEFAULT_CATEGORIES.map(async (category) => {
    try {
      const docRef = await addDoc(categoriesRef, {
        ...category,
        createdAt: now,
        updatedAt: now,
      });
      console.log(`Added category: ${category.name} with ID: ${docRef.id}`);
      return docRef;
    } catch (error) {
      console.error(`Error adding category ${category.name}:`, error);
      throw error;
    }
  });

  await Promise.all(promises);
  console.log("Database seeding completed successfully!");
}

// Run the seed function
seedCategories()
  .then(() => {
    console.log("Seed script completed.");
  })
  .catch((error) => {
    console.error("Error in seed script:", error);
  });
