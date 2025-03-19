import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";

interface NotificationButtonProps {
  permission: NotificationPermission;
  onClick: () => void;
  error?: string | null;
}

export function NotificationButton({
  permission,
  onClick,
  error,
}: NotificationButtonProps) {
  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={onClick}
        className={`relative ${permission === "granted" ? "text-blue-600" : ""}`}
        title={
          error
            ? error
            : permission === "granted"
              ? "Notifications enabled"
              : "Enable notifications"
        }
      >
        <Bell className="h-5 w-5" />
        {permission === "granted" && (
          <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-blue-600" />
        )}
      </Button>
      {error && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-red-100 text-red-800 text-xs rounded whitespace-nowrap">
          {error}
        </div>
      )}
    </div>
  );
}
