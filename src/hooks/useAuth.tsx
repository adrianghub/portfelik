import { User, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { auth, db } from "../lib/firebase/firebase";

type UserRole = "user" | "admin";

export interface UserData {
  uid: string;
  email: string | null;
  role: UserRole;
  createdAt: Date;
  lastLoginAt: Date;
  name?: string;
}

export function useAuth() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);

      if (user) {
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
              ...existingData,
              lastLoginAt: new Date(),
            },
            { merge: true },
          );

          setUserData(updatedUserData);
        }
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
      console.error("Error getting ID token:", error);
      return null;
    }
  };

  return {
    currentUser,
    userData,
    isLoading,
    isAuthenticated: !!currentUser,
    getIdToken,
  };
}
