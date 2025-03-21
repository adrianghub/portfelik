import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/cn";
import { Bell, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import {
  useDeleteNotification,
  useMarkAllNotificationsAsRead,
  useMarkNotificationAsRead,
  useNotifications,
  useToggleNotificationReadState,
  useUnreadNotificationCount,
} from "../../notifications/useNotificationsQuery";
import { NotificationList } from "./NotificationList";

export function NotificationsPopover() {
  const [open, setOpen] = useState(false);

  const {
    data: notifications = [],
    isLoading,
    refetch: refreshNotifications,
  } = useNotifications();

  const { data: unreadCount = 0 } = useUnreadNotificationCount();

  const markAsRead = useMarkNotificationAsRead();
  const markAllAsRead = useMarkAllNotificationsAsRead();
  const toggleReadState = useToggleNotificationReadState();
  const deleteNotification = useDeleteNotification();

  useEffect(() => {
    if (open) {
      refreshNotifications();
    }
  }, [open, refreshNotifications]);

  const handleMarkAsRead = async (id: string) => {
    try {
      await markAsRead.mutateAsync(id);
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
    }
  };

  const handleToggleReadState = async (id: string) => {
    try {
      await toggleReadState.mutateAsync(id);
    } catch (error) {
      console.error("Failed to toggle notification read state:", error);
    }
  };

  const handleDeleteNotification = async (id: string) => {
    try {
      await deleteNotification.mutateAsync(id);
    } catch (error) {
      console.error("Failed to delete notification:", error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllAsRead.mutateAsync();
    } catch (error) {
      console.error("Failed to mark all notifications as read:", error);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label="View notifications"
        >
          <Bell className={cn("h-5 w-5", unreadCount > 0 && "text-blue-600")} />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-medium text-lg">Notifications</h3>
          <div className="flex">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => refreshNotifications()}
              disabled={isLoading}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <NotificationList
          notifications={notifications}
          loading={isLoading}
          onMarkAsRead={handleMarkAsRead}
          onToggleReadState={handleToggleReadState}
          onDeleteNotification={handleDeleteNotification}
          onMarkAllAsRead={handleMarkAllAsRead}
        />
      </PopoverContent>
    </Popover>
  );
}
