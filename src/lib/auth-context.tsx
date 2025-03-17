import { User, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import { auth, db } from "./firebase";

type UserRole = "user" | "admin";

export interface UserData {
  uid: string;
  email: string | null;
  role: UserRole;
  createdAt: Date;
  lastLoginAt: Date;
}

interface AuthContextType {
  currentUser: User | null;
  userData: UserData | null;
  isAdmin: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  userData: null,
  isAdmin: false,
  isLoading: true,
  isAuthenticated: false,
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);

      if (user) {
        // Get or create user document in Firestore
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          // User exists, update last login
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
        } else {
          // New user, create document
          const newUserData: UserData = {
            uid: user.uid,
            email: user.email,
            role: "user", // Default role
            createdAt: new Date(),
            lastLoginAt: new Date(),
          };

          await setDoc(userRef, {
            email: user.email,
            role: "user",
            createdAt: new Date(),
            lastLoginAt: new Date(),
          });

          setUserData(newUserData);
        }
      } else {
        setUserData(null);
      }

      setIsLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    userData,
    isAdmin: userData?.role === "admin",
    isLoading,
    isAuthenticated: !!currentUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
