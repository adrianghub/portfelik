import { useContext } from "react";
import { UserContext, UserContextType } from "./UserContext";

export function useUsersContext(): UserContextType {
  const context = useContext(UserContext);

  if (context === undefined) {
    throw new Error("useUsersContext must be used within a UserProvider");
  }

  return context;
}
