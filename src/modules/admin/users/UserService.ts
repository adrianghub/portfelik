import type { UserData as AuthUserData } from "@/lib/AuthContext";
import { COLLECTIONS, FirestoreService } from "@/lib/firebase/firestore";
import { limit, QueryConstraint, where } from "firebase/firestore";

export interface UserData extends AuthUserData {
  id?: string;
}

export class UserService extends FirestoreService<UserData> {
  constructor() {
    super(COLLECTIONS.USERS);
  }

  // Get user by email
  async getUserByEmail(email: string): Promise<UserData | null> {
    const constraints: QueryConstraint[] = [
      where("email", "==", email),
      limit(1),
    ];

    const users = await this.query(constraints);
    return users.length > 0 ? users[0] : null;
  }

  // Update user role
  async updateUserRole(
    userId: string,
    role: "user" | "admin",
  ): Promise<UserData> {
    return this.update(userId, { role });
  }
}

export const userService = new UserService();
