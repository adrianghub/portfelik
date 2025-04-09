import { UserData } from "@/hooks/useAuth";
import { db } from "@/lib/firebase/firebase";
import { COLLECTIONS, FirestoreService } from "@/lib/firebase/firestore";
import {
  collection,
  deleteDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";

interface UserDataWithId extends UserData {
  id?: string;
}

export class UserService extends FirestoreService<UserDataWithId> {
  constructor() {
    super(COLLECTIONS.USERS);
  }

  async updateUserProfile(
    userId: string,
    updates: Partial<UserData>,
  ): Promise<UserDataWithId> {
    return this.update(userId, updates);
  }

  async deleteUserAccount(userId: string): Promise<void> {
    const groupsRef = collection(db, COLLECTIONS.USER_GROUPS);
    const userGroupsQuery = query(groupsRef, where("ownerId", "==", userId));
    const userGroupsSnapshot = await getDocs(userGroupsQuery);

    const deleteGroupPromises = userGroupsSnapshot.docs.map((doc) =>
      deleteDoc(doc.ref),
    );
    await Promise.all(deleteGroupPromises);

    const invitationsRef = collection(db, COLLECTIONS.GROUP_INVITATIONS);
    const userInvitationsQuery = query(
      invitationsRef,
      where("invitedUserId", "==", userId),
    );
    const userInvitationsSnapshot = await getDocs(userInvitationsQuery);

    const deleteInvitationPromises = userInvitationsSnapshot.docs.map((doc) =>
      deleteDoc(doc.ref),
    );
    await Promise.all(deleteInvitationPromises);

    const transactionsRef = collection(db, COLLECTIONS.TRANSACTIONS);
    const userTransactionsQuery = query(
      transactionsRef,
      where("userId", "==", userId),
    );
    const userTransactionsSnapshot = await getDocs(userTransactionsQuery);

    const deleteTransactionPromises = userTransactionsSnapshot.docs.map((doc) =>
      deleteDoc(doc.ref),
    );
    await Promise.all(deleteTransactionPromises);

    const shoppingListsRef = collection(db, COLLECTIONS.SHOPPING_LISTS);
    const userShoppingListsQuery = query(
      shoppingListsRef,
      where("userId", "==", userId),
    );
    const userShoppingListsSnapshot = await getDocs(userShoppingListsQuery);

    const deleteShoppingListPromises = userShoppingListsSnapshot.docs.map(
      (doc) => deleteDoc(doc.ref),
    );
    await Promise.all(deleteShoppingListPromises);

    await this.delete(userId);
  }
}

export const userService = new UserService();
