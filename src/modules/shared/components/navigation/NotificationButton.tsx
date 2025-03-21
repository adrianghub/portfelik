import { Button } from "@/components/ui/button";
import { NotificationsPopover } from "@/modules/shared/notifications/components/NotificationsPopover";
import { Bell } from "lucide-react";

interface NotificationButtonProps {
  permission: NotificationPermission;
  onClick: () => void;
}

export function NotificationButton({
  permission,
  onClick,
}: NotificationButtonProps) {
  if (permission !== "granted") {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={onClick}
        className="relative"
        title="Enable notifications"
      >
        <Bell className="h-5 w-5" />
      </Button>
    );
  }

  return <NotificationsPopover />;
}
