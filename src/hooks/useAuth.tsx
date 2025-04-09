import { logger } from "@/lib/logger";
import { User, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { auth, db, signInWithGoogle } from "../lib/firebase/firebase";

type UserRole = "user" | "admin";

export interface UserData {
  uid: string;
  email: string | null;
  role: UserRole;
  createdAt: Date;
  lastLoginAt: Date;
  name?: string;
  settings?: {
    notificationsEnabled: boolean;
  };
}

export function useAuth() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const ensureUserDataExists = async (user: User) => {
    try {
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const existingData = userSnap.data() as Omit<UserData, "uid">;
        const updatedUserData = {
          ...existingData,
          uid: user.uid,
          lastLoginAt: new Date(),
        } as UserData;

        await setDoc(
          userRef,
          {
            lastLoginAt: new Date(),
          },
          { merge: true },
        );

        setUserData(updatedUserData);
        return updatedUserData;
      } else {
        const newUserData: UserData = {
          uid: user.uid,
          email: user.email,
          role: "user",
          createdAt: new Date(),
          lastLoginAt: new Date(),
          name: user.displayName || undefined,
          settings: {
            notificationsEnabled: false,
          },
        };

        await setDoc(userRef, newUserData);

        const verifySnap = await getDoc(userRef);
        if (verifySnap.exists()) {
          setUserData(newUserData);
          return newUserData;
        } else {
          logger.error("Auth", "Failed to create user document!");
          return null;
        }
      }
    } catch (error) {
      logger.error("Auth", "Error ensuring user data exists:", error);
      return null;
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);

      if (user) {
        await ensureUserDataExists(user);
      } else {
        setUserData(null);
      }

      setIsLoading(false);
    });

    return unsubscribe;
  }, []);

  const getIdToken = async (): Promise<string | null> => {
    if (!currentUser) return null;
    try {
      return await currentUser.getIdToken();
    } catch (error) {
      logger.error("Auth", "Error getting ID token:", error);
      return null;
    }
  };

  const signInWithGoogleAccount = async (): Promise<void> => {
    try {
      await signInWithGoogle();
      logger.info("Auth", "Google sign-in successful");
    } catch (error) {
      logger.error("Auth", "Error signing in with Google:", error);
      throw error;
    }
  };

  return {
    currentUser,
    userData,
    isLoading,
    isAuthenticated: !!currentUser,
    getIdToken,
    signInWithGoogle: signInWithGoogleAccount,
  };
}
