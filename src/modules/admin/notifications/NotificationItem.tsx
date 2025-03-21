import { Button } from "@/components/ui/button";
import type { Notification } from "@/modules/shared/notifications/notification";
import type {
  useDeleteNotification,
  useToggleNotificationReadState,
} from "@/modules/shared/notifications/useNotificationsQuery";
import dayjs from "dayjs";
import { Eye, EyeOff, Trash2 } from "lucide-react";

interface NotificationItemProps {
  notification: Notification;
  handleAction: (action: () => Promise<unknown>) => Promise<void>;
  toggleReadStateMutation: ReturnType<typeof useToggleNotificationReadState>;
  deleteNotificationMutation: ReturnType<typeof useDeleteNotification>;
}

export const NotificationItem = ({
  notification,
  handleAction,
  toggleReadStateMutation,
  deleteNotificationMutation,
}: NotificationItemProps) => (
  <div
    key={notification.id}
    className={`p-3 rounded-md border ${notification.read ? "bg-muted/50" : "bg-accent"}`}
  >
    <div className="flex justify-between">
      <div className="font-medium">{notification.title}</div>
      <div className="flex space-x-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 text-muted-foreground hover:text-primary"
          onClick={() =>
            handleAction(() =>
              toggleReadStateMutation.mutateAsync(notification.id),
            )
          }
          title={notification.read ? "Mark as unread" : "Mark as read"}
        >
          {notification.read ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 text-muted-foreground hover:text-destructive"
          onClick={() =>
            handleAction(() =>
              deleteNotificationMutation.mutateAsync(notification.id),
            )
          }
          title="Delete notification"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
    <div className="text-sm mt-1">{notification.body}</div>
    <div className="text-xs text-muted-foreground mt-2 flex items-center justify-between">
      <span>
        Created: {dayjs(notification.createdAt).fromNow()} (
        {new Date(notification.createdAt).toLocaleString()})
      </span>
      <span>{notification.read ? "Read" : "Unread"}</span>
    </div>
  </div>
);
