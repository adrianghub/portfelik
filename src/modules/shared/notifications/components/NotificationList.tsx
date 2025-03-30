import { Button } from "@/components/ui/button";
import dayjs from "@/lib/date-utils";
import { Notification } from "@/modules/shared/notifications/notification";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Check, Eye, EyeOff, MailOpen, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

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
  const navigate = useNavigate();
  const { t } = useTranslation();
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

  const handleClick = () => {
    // Mark as read when clicked
    handleMarkAsRead();

    // Navigate based on notification type and data
    if (notification.type === "group_invitation") {
      // Use link from data if available, otherwise use default navigation
      if (notification.data?.link) {
        const link = notification.data.link as string;
        // For relative links, use navigate, for absolute links use window.open
        if (link.startsWith("/")) {
          // Parse the URL to extract search parameters
          const url = new URL(link, window.location.origin);

          // For the /settings path, handle specific parameters
          if (url.pathname === "/settings") {
            const tab = url.searchParams.get("tab") || "groups";
            const subtab = url.searchParams.get("subtab");

            navigate({
              to: "/settings",
              search: {
                tab,
                ...(subtab ? { subtab } : {}),
              },
            });
          } else {
            // For other paths, just navigate to the pathname
            navigate({ to: url.pathname });
          }
        } else {
          window.open(link, "_blank");
        }
      } else {
        // Default navigation for group invitations
        navigate({
          to: "/settings",
          search: {
            tab: "groups",
            subtab: "invitations",
          },
        });
      }
    }
    // Add more notification type navigation handlers as needed
  };

  const isClickable = notification.type === "group_invitation";

  return (
    <div
      className={`flex items-start gap-2 rounded-md p-2 text-sm transition-colors ${
        notification.read ? "bg-background" : "bg-accent"
      } ${isClickable ? "cursor-pointer hover:bg-accent/80" : ""}`}
      onClick={isClickable ? handleClick : undefined}
    >
      <div className="flex-1">
        <div className="font-medium">{notification.title}</div>
        <div className="text-xs text-muted-foreground">{time}</div>
        <div className="mt-1">{notification.body}</div>

        {notification.type === "group_invitation" && (
          <div className="mt-2">
            <Button
              variant="outline"
              size="sm"
              className="text-xs hover:bg-accent"
              onClick={(e) => {
                e.stopPropagation();
                handleClick();
              }}
            >
              {t("notifications.groupInvitation.checkInvitation")}
              <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1">
        {onToggleReadState ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 text-muted-foreground/50 hover:text-muted-foreground"
            onClick={(e) => {
              e.stopPropagation(); // Prevent triggering the parent onClick
              handleToggleReadState();
            }}
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
              onClick={(e) => {
                e.stopPropagation(); // Prevent triggering the parent onClick
                handleMarkAsRead();
              }}
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
            onClick={(e) => {
              e.stopPropagation(); // Prevent triggering the parent onClick
              handleDelete();
            }}
            title="Delete notification"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
