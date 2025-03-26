import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { UserProvider } from "../UserContext";
import { useUsersContext } from "../useUsersContext";
import { UserTable } from "./UserTable";

function UserManagerContent() {
  const { loadUsers, isLoading, message } = useUsersContext();

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Button
          onClick={loadUsers}
          disabled={isLoading}
          variant="outline"
          size="sm"
          className="flex items-center gap-1"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {message && (
        <div
          className={`p-3 rounded-md ${
            message.type === "success"
              ? "bg-green-100 text-green-800"
              : "bg-red-100 text-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      <UserTable />
    </div>
  );
}

export function UserManager() {
  return (
    <UserProvider>
      <UserManagerContent />
    </UserProvider>
  );
}
