import { UserData } from "@/hooks/useAuth";
import {
  assignAdminRole,
  deleteUser,
  getAllUsers,
  removeAdminRole,
  updateUserEmail,
} from "@/lib/admin-utils";
import { createContext, ReactNode, useEffect, useState } from "react";

export type UserContextType = {
  users: UserData[];
  isLoading: boolean;
  error: Error | null;
  loadUsers: () => Promise<void>;
  toggleUserRole: (user: UserData) => Promise<void>;
  updateEmail: (userId: string, newEmail: string) => Promise<void>;
  removeUser: (userId: string) => Promise<void>;
  message: { type: "success" | "error"; text: string } | null;
  setMessage: (
    message: { type: "success" | "error"; text: string } | null,
  ) => void;
};

export const UserContext = createContext<UserContextType | undefined>(
  undefined,
);

type UserProviderProps = {
  children: ReactNode;
};

export function UserProvider({ children }: UserProviderProps) {
  const [users, setUsers] = useState<UserData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Load users on component mount
  useEffect(() => {
    loadUsers();
  }, []);

  // Load all users from Firestore
  const loadUsers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const allUsers = await getAllUsers();
      setUsers(allUsers);
      setMessage({
        type: "success",
        text: `Loaded ${allUsers.length} users`,
      });
    } catch (error) {
      const err = error as Error;
      setError(err);
      setMessage({
        type: "error",
        text: `Error loading users: ${err.message}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle user role (admin/user)
  const toggleUserRole = async (user: UserData) => {
    setIsLoading(true);
    try {
      if (user.role === "admin") {
        await removeAdminRole(user.uid);
        setMessage({
          type: "success",
          text: `Admin role removed from ${user.email}`,
        });
      } else {
        await assignAdminRole(user.uid);
        setMessage({
          type: "success",
          text: `Admin role assigned to ${user.email}`,
        });
      }
      // Reload users to reflect changes
      await loadUsers();
    } catch (error) {
      const err = error as Error;
      setError(err);
      setMessage({
        type: "error",
        text: `Error updating role: ${err.message}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Update user email
  const updateEmail = async (userId: string, newEmail: string) => {
    setIsLoading(true);
    try {
      await updateUserEmail(userId, newEmail);
      setMessage({
        type: "success",
        text: `Email updated for user ${userId}`,
      });
      // Reload users to reflect changes
      await loadUsers();
    } catch (error) {
      const err = error as Error;
      setError(err);
      setMessage({
        type: "error",
        text: `Error updating email: ${err.message}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Delete user
  const removeUser = async (userId: string) => {
    setIsLoading(true);
    try {
      await deleteUser(userId);
      setMessage({
        type: "success",
        text: `User deleted successfully`,
      });
      // Reload users to reflect changes
      await loadUsers();
    } catch (error) {
      const err = error as Error;
      setError(err);
      setMessage({
        type: "error",
        text: `Error deleting user: ${err.message}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const value = {
    users,
    isLoading,
    error,
    loadUsers,
    toggleUserRole,
    updateEmail,
    removeUser,
    message,
    setMessage,
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}
