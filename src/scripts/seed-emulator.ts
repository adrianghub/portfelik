import dayjs from "dayjs";
import {
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
} from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../lib/firebase/firebase";

const DEFAULT_CATEGORIES = [
  { id: "salary", name: "Salary", type: "income" },
  { id: "freelance", name: "Freelance", type: "income" },
  { id: "investment", name: "Investment", type: "income" },
  { id: "gift", name: "Gift", type: "income" },
  { id: "food", name: "Food & Groceries", type: "expense" },
  { id: "housing", name: "Housing & Rent", type: "expense" },
  { id: "utilities", name: "Utilities", type: "expense" },
  {
    id: "transportation",
    name: "Transportation",
    type: "expense",
  },
  {
    id: "entertainment",
    name: "Entertainment",
    type: "expense",
  },
  { id: "healthcare", name: "Healthcare", type: "expense" },
  { id: "education", name: "Education", type: "expense" },
  { id: "shopping", name: "Shopping", type: "expense" },
  { id: "travel", name: "Travel", type: "expense" },
];

const SAMPLE_TRANSACTIONS = [
  {
    amount: 5000,
    description: "Monthly Salary",
    categoryId: "salary",
    date: dayjs("2025-02-01").toISOString(),
    type: "income",
  },
  {
    amount: -120,
    description: "Grocery Shopping",
    categoryId: "food",
    date: dayjs("2025-02-05").toISOString(),
    type: "expense",
  },
  {
    amount: -50,
    description: "Gas Bill",
    categoryId: "utilities",
    date: dayjs("2025-02-10").toISOString(),
    type: "expense",
  },
];

// Test user credentials
const TEST_USER = {
  email: "test@example.com",
  password: "testuser123",
  role: "user",
};

const ADMIN_USER = {
  email: "admin@example.com",
  password: "adminuser123",
  role: "admin",
};

async function seedEmulator() {
  console.log("Starting emulator seeding process...");

  await clearExistingData();

  let adminUserId = "";
  try {
    const auth = getAuth();
    try {
      const credential = await signInWithEmailAndPassword(
        auth,
        ADMIN_USER.email,
        ADMIN_USER.password,
      );
      console.log("Admin user already exists, signed in as admin");
      adminUserId = credential.user.uid;
    } catch {
      adminUserId = await createAdminUser();
      await signInWithEmailAndPassword(
        auth,
        ADMIN_USER.email,
        ADMIN_USER.password,
      );
      console.log("Created admin user and signed in");
    }
  } catch (error) {
    console.error("Error signing in as admin:", error);
    throw new Error("Failed to sign in as admin, cannot proceed with seeding");
  }

  let testUserId = "";
  try {
    const auth = getAuth();
    try {
      const credential = await signInWithEmailAndPassword(
        auth,
        TEST_USER.email,
        TEST_USER.password,
      );
      console.log("Test user already exists, reusing it");
      testUserId = credential.user.uid;
    } catch {
      testUserId = await createTestUser();
    }
  } catch (error) {
    console.error("Error with test user:", error);
    throw new Error("Failed to create or retrieve test user");
  }

  try {
    const auth = getAuth();
    await signInWithEmailAndPassword(
      auth,
      ADMIN_USER.email,
      ADMIN_USER.password,
    );
  } catch (error) {
    console.error("Error signing back in as admin:", error);
    throw new Error("Failed to sign back in as admin");
  }

  const categoryMap = await createCategories(adminUserId);

  try {
    const auth = getAuth();
    await signInWithEmailAndPassword(auth, TEST_USER.email, TEST_USER.password);
  } catch (error) {
    console.error("Error signing in as test user:", error);
    throw new Error("Failed to sign in as test user");
  }

  await createTransactions(testUserId, categoryMap);

  console.log("Emulator seeding completed successfully!");
  console.log("\nTest user credentials:");
  console.log(`- Email: ${TEST_USER.email}`);
  console.log(`- Password: ${TEST_USER.password}`);
  console.log("\nAdmin user credentials:");
  console.log(`- Email: ${ADMIN_USER.email}`);
  console.log(`- Password: ${ADMIN_USER.password}`);
}

async function clearExistingData() {
  console.log("Clearing existing data...");

  const collections = ["categories", "transactions"];

  for (const collectionName of collections) {
    try {
      console.log(`Clearing ${collectionName} collection...`);
      const collectionRef = collection(db, collectionName);
      const snapshot = await getDocs(collectionRef);

      const batchSize = 500;
      let batch = writeBatch(db);
      let count = 0;

      for (const document of snapshot.docs) {
        batch.delete(doc(db, collectionName, document.id));
        count++;

        if (count >= batchSize) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }

      if (count > 0) {
        await batch.commit();
      }

      console.log(`Deleted ${snapshot.size} documents from ${collectionName}`);
    } catch (error) {
      console.error(`Error clearing ${collectionName} collection:`, error);
    }
  }

  console.log("Data clearing completed (users preserved).");
}

async function createTestUser(): Promise<string> {
  console.log("Creating test user...");

  try {
    // Create the authentication user
    const auth = getAuth();
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      TEST_USER.email,
      TEST_USER.password,
    );

    const userId = userCredential.user.uid;

    // Create the user document in Firestore
    const userRef = doc(db, "users", userId);
    await setDoc(userRef, {
      email: TEST_USER.email,
      role: TEST_USER.role,
      createdAt: new Date(),
      lastLoginAt: new Date(),
    });

    console.log("Test user created with ID:", userId);
    return userId;
  } catch (error) {
    console.error("Error creating test user:", error);
    const userCollectionRef = collection(db, "users");
    const userDocRef = await addDoc(userCollectionRef, {
      email: TEST_USER.email,
      role: TEST_USER.role,
      createdAt: new Date(),
      lastLoginAt: new Date(),
    });
    console.log("Test user document created with ID:", userDocRef.id);
    return userDocRef.id;
  }
}

async function createAdminUser(): Promise<string> {
  console.log("Creating admin user...");

  try {
    const auth = getAuth();
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      ADMIN_USER.email,
      ADMIN_USER.password,
    );

    const userId = userCredential.user.uid;

    const userRef = doc(db, "users", userId);
    await setDoc(userRef, {
      email: ADMIN_USER.email,
      role: ADMIN_USER.role,
      isAdmin: true,
      createdAt: new Date(),
      lastLoginAt: new Date(),
    });

    console.log("Admin user created with ID:", userId);
    return userId;
  } catch (error) {
    console.error("Error creating admin user:", error);
    const userCollectionRef = collection(db, "users");
    const userDocRef = await addDoc(userCollectionRef, {
      email: ADMIN_USER.email,
      role: ADMIN_USER.role,
      isAdmin: true,
      createdAt: new Date(),
      lastLoginAt: new Date(),
    });
    console.log("Admin user document created with ID:", userDocRef.id);
    return userDocRef.id;
  }
}

async function createCategories(
  adminUserId: string,
): Promise<Record<string, string>> {
  console.log("Creating default categories...");
  const categoriesRef = collection(db, "categories");
  const categoryMap: Record<string, string> = {};

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
        userId: adminUserId,
        createdAt: now,
        updatedAt: now,
      });

      const keyById = category.id.toLowerCase();
      const keyByName = category.name.toLowerCase().replace(/[^a-z0-9]/g, "");

      categoryMap[keyById] = docRef.id;
      categoryMap[keyByName] = docRef.id;

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
      // Find the categoryId in the map by name
      let categoryId = transaction.categoryId;
      const normalizedCategoryId = categoryId.toLowerCase();

      if (categoryMap[normalizedCategoryId]) {
        categoryId = categoryMap[normalizedCategoryId];
        console.log(
          `Mapped category '${transaction.categoryId}' to ID: ${categoryId}`,
        );
      } else {
        console.warn(
          `Warning: Category '${transaction.categoryId}' not found in category map, using as-is.`,
        );
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

seedEmulator()
  .then(() => {
    console.log("\n======================================================");
    console.log("🎉 Emulator seed script completed successfully!");
    console.log("======================================================");
    console.log("\n📝 Test user credentials:");
    console.log(`   Email: ${TEST_USER.email}`);
    console.log(`   Password: ${TEST_USER.password}`);
    console.log("\n👑 Admin user credentials:");
    console.log(`   Email: ${ADMIN_USER.email}`);
    console.log(`   Password: ${ADMIN_USER.password}`);
    console.log("\n▶️ To start the emulators and app:");
    console.log("   npm run dev:all");
    console.log("\n🔑 Login with the credentials above");
    console.log("======================================================");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error in emulator seed script:", error);
    process.exit(1);
  });
