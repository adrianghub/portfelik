import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/cn";
import { NotificationList } from "@/modules/shared/notifications/components/NotificationList";
import { useNotificationActions } from "@/modules/shared/notifications/useNotificationActions";
import { Bell } from "lucide-react";
import { useState } from "react";

export function MobileNotificationsPanel() {
  const [showNotifications, setShowNotifications] = useState(false);
  const {
    notifications,
    isLoading,
    unreadCount,
    refreshNotifications,
    handleMarkAsRead,
    handleToggleReadState,
    handleDeleteNotification,
    handleMarkAllAsRead,
  } = useNotificationActions();

  return (
    <div className="flex flex-col w-full">
      <Button
        variant="outline"
        className="flex items-center justify-between w-full py-5"
        onClick={() => {
          setShowNotifications(!showNotifications);
          if (!showNotifications) refreshNotifications();
        }}
      >
        <div className="flex items-center gap-2">
          <Bell className={cn("h-4 w-4", unreadCount > 0 && "text-blue-600")} />
          Notifications
        </div>
        {unreadCount > 0 && (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs text-white">
            {unreadCount}
          </span>
        )}
      </Button>

      {showNotifications && (
        <div className="mt-4 border rounded-md bg-background w-full">
          <ScrollArea className="h-[400px]">
            <div className="p-4 pb-20">
              <NotificationList
                notifications={notifications}
                loading={isLoading}
                onMarkAsRead={handleMarkAsRead}
                onToggleReadState={handleToggleReadState}
                onDeleteNotification={handleDeleteNotification}
                onMarkAllAsRead={handleMarkAllAsRead}
              />
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
