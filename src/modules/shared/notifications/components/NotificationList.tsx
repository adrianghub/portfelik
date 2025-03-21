import { Button } from "@/components/ui/button";
import dayjs from "@/lib/date-utils";
import { Notification } from "@/modules/shared/notifications/notification";
import { Check, Eye, EyeOff, MailOpen, Trash2 } from "lucide-react";

interface NotificationListProps {
  notifications: Notification[];
  loading: boolean;
  onMarkAsRead: (id: string) => void;
  onToggleReadState?: (id: string) => void;
  onDeleteNotification?: (id: string) => void;
  onMarkAllAsRead: () => void;
}

export function NotificationList({
  notifications,
  loading,
  onMarkAsRead,
  onToggleReadState,
  onDeleteNotification,
  onMarkAllAsRead,
}: NotificationListProps) {
  if (loading) {
    return (
      <div className="py-2 text-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">
        You're all up to date
      </div>
    );
  }

  const hasUnread = notifications.some((notification) => !notification.read);

  return (
    <div className="flex flex-col gap-2 max-h-[350px] overflow-y-auto">
      {hasUnread && (
        <div className="flex justify-end p-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onMarkAllAsRead}
            className="text-xs text-muted-foreground"
          >
            <Check className="mr-1 h-3 w-3" />
            Mark all as read
          </Button>
        </div>
      )}

      <div className="grid gap-2 p-1">
        {notifications.map((notification) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            onMarkAsRead={onMarkAsRead}
            onToggleReadState={onToggleReadState}
            onDeleteNotification={onDeleteNotification}
          />
        ))}
      </div>
    </div>
  );
}

interface NotificationItemProps {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
  onToggleReadState?: (id: string) => void;
  onDeleteNotification?: (id: string) => void;
}

function NotificationItem({
  notification,
  onMarkAsRead,
  onToggleReadState,
  onDeleteNotification,
}: NotificationItemProps) {
  const time = dayjs(notification.createdAt).fromNow();

  const handleMarkAsRead = () => {
    if (!notification.read) {
      onMarkAsRead(notification.id);
    }
  };

  const handleToggleReadState = () => {
    if (onToggleReadState) {
      onToggleReadState(notification.id);
    } else if (!notification.read) {
      // Fallback to legacy behavior if toggle not available
      onMarkAsRead(notification.id);
    }
  };

  const handleDelete = () => {
    if (onDeleteNotification) {
      onDeleteNotification(notification.id);
    }
  };

  return (
    <div
      className={`flex items-start gap-2 rounded-md p-2 text-sm transition-colors ${
        notification.read ? "bg-background" : "bg-accent"
      }`}
    >
      <div className="flex-1">
        <div className="font-medium">{notification.title}</div>
        <div className="text-xs text-muted-foreground">{time}</div>
        <div className="mt-1">{notification.body}</div>
      </div>

      <div className="flex flex-col gap-1">
        {onToggleReadState ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 text-muted-foreground/50 hover:text-muted-foreground"
            onClick={handleToggleReadState}
            title={notification.read ? "Mark as unread" : "Mark as read"}
          >
            {notification.read ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </Button>
        ) : (
          !notification.read && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 text-muted-foreground/50 hover:text-muted-foreground"
              onClick={handleMarkAsRead}
            >
              <MailOpen className="h-4 w-4" />
              <span className="sr-only">Mark as read</span>
            </Button>
          )
        )}

        {onDeleteNotification && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 text-muted-foreground/50 hover:text-destructive"
            onClick={handleDelete}
            title="Delete notification"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
