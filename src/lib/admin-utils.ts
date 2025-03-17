import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { UserData } from "./auth-context";
import { db } from "./firebase";

/**
 * Assigns the admin role to a user
 * @param userId The ID of the user to assign the admin role to
 * @returns A promise that resolves when the role is assigned
 * @throws An error if the user doesn't exist
 */
export async function assignAdminRole(userId: string): Promise<void> {
  // Get the user document
  const userRef = doc(db, "users", userId);
  const userSnap = await getDoc(userRef);

  // Check if the user exists
  if (!userSnap.exists()) {
    throw new Error(`User with ID ${userId} does not exist`);
  }

  // Update the user's role to admin
  await updateDoc(userRef, {
    role: "admin",
  });
}

/**
 * Removes the admin role from a user
 * @param userId The ID of the user to remove the admin role from
 * @returns A promise that resolves when the role is removed
 * @throws An error if the user doesn't exist
 */
export async function removeAdminRole(userId: string): Promise<void> {
  // Get the user document
  const userRef = doc(db, "users", userId);
  const userSnap = await getDoc(userRef);

  // Check if the user exists
  if (!userSnap.exists()) {
    throw new Error(`User with ID ${userId} does not exist`);
  }

  // Update the user's role to user
  await updateDoc(userRef, {
    role: "user",
  });
}

/**
 * Gets a user's Firebase UID from their email
 * @param email The email of the user to get the UID for
 * @returns A promise that resolves with the user's UID, or null if the user doesn't exist
 */
export async function getUserIdByEmail(email: string): Promise<string | null> {
  // Query the users collection for a user with the given email
  const usersRef = collection(db, "users");
  const q = query(usersRef, where("email", "==", email));
  const querySnapshot = await getDocs(q);

  // If no user is found, return null
  if (querySnapshot.empty) {
    return null;
  }

  // Return the first user's ID
  return querySnapshot.docs[0].id;
}

/**
 * Gets a user by their email
 * @param email The email of the user to get
 * @returns A promise that resolves with the user data, or null if the user doesn't exist
 */
export async function getUserByEmail(email: string): Promise<UserData | null> {
  // Query the users collection for a user with the given email
  const usersRef = collection(db, "users");
  const q = query(usersRef, where("email", "==", email));
  const querySnapshot = await getDocs(q);

  // If no user is found, return null
  if (querySnapshot.empty) {
    return null;
  }

  // Return the first user's data
  const doc = querySnapshot.docs[0];
  return {
    uid: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt.toDate(),
    lastLoginAt: doc.data().lastLoginAt.toDate(),
  } as UserData;
}

/**
 * Gets a user by their ID
 * @param userId The ID of the user to get
 * @returns A promise that resolves with the user data, or null if the user doesn't exist
 */
export async function getUserById(userId: string): Promise<UserData | null> {
  // Get the user document
  const userRef = doc(db, "users", userId);
  const userSnap = await getDoc(userRef);

  // If the user doesn't exist, return null
  if (!userSnap.exists()) {
    return null;
  }

  // Return the user data
  const data = userSnap.data();
  return {
    uid: userId,
    ...data,
    createdAt: data.createdAt.toDate(),
    lastLoginAt: data.lastLoginAt.toDate(),
  } as UserData;
}

/**
 * Gets all users
 * @returns A promise that resolves with an array of all users
 */
export async function getAllUsers(): Promise<UserData[]> {
  // Get all users from the users collection
  const usersRef = collection(db, "users");
  const querySnapshot = await getDocs(usersRef);

  // Map the documents to UserData objects
  return querySnapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      uid: doc.id,
      ...data,
      createdAt: data.createdAt.toDate(),
      lastLoginAt: data.lastLoginAt.toDate(),
    } as UserData;
  });
}

/**
 * Updates a user's email
 * @param userId The ID of the user to update
 * @param newEmail The new email for the user
 * @returns A promise that resolves when the email is updated
 * @throws An error if the user doesn't exist
 */
export async function updateUserEmail(
  userId: string,
  newEmail: string,
): Promise<void> {
  // Get the user document
  const userRef = doc(db, "users", userId);
  const userSnap = await getDoc(userRef);

  // Check if the user exists
  if (!userSnap.exists()) {
    throw new Error(`User with ID ${userId} does not exist`);
  }

  // Update the user's email
  await updateDoc(userRef, {
    email: newEmail,
  });
}

/**
 * Deletes a user
 * @param userId The ID of the user to delete
 * @returns A promise that resolves when the user is deleted
 * @throws An error if the user doesn't exist
 */
export async function deleteUser(userId: string): Promise<void> {
  // Get the user document
  const userRef = doc(db, "users", userId);
  const userSnap = await getDoc(userRef);

  // Check if the user exists
  if (!userSnap.exists()) {
    throw new Error(`User with ID ${userId} does not exist`);
  }

  // Delete the user document
  await deleteDoc(userRef);
}
