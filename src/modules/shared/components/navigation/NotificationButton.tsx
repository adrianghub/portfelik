import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";

interface NotificationButtonProps {
  permission: NotificationPermission;
  onClick: () => void;
}

export function NotificationButton({
  permission,
  onClick,
}: NotificationButtonProps) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      className={`relative ${permission === "granted" ? "text-blue-600" : ""}`}
      title={
        permission === "granted"
          ? "Notifications enabled"
          : "Enable notifications"
      }
    >
      <Bell className="h-5 w-5 text-blue-600" />
      {permission === "granted" && (
        <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
      )}
    </Button>
  );
}
