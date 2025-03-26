import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  useDeleteNotification,
  useMarkAllNotificationsAsRead,
} from "@/modules/shared/notifications/hooks/useNotificationsQuery";
import {
  addMockNotifications,
  createMockNotification,
} from "@/modules/shared/notifications/mock";
import type { Notification } from "@/modules/shared/notifications/notification";

interface NotificationControlsProps {
  fetchNotifications: () => void;
  handleAction: (
    action: () => Promise<unknown>,
    successMessage?: string,
  ) => Promise<void>;
  notifications: Notification[];
  markAllAsReadMutation: ReturnType<typeof useMarkAllNotificationsAsRead>;
  deleteNotificationMutation: ReturnType<typeof useDeleteNotification>;
}

export const NotificationControls = ({
  fetchNotifications,
  handleAction,
  notifications,
  markAllAsReadMutation,
  deleteNotificationMutation,
}: NotificationControlsProps) => (
  <Card>
    <CardHeader>
      <CardTitle>Test Controls</CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => fetchNotifications()}>
          Fetch Notifications
        </Button>
        <Button onClick={() => handleAction(addMockNotifications)}>
          Add Mock
        </Button>
        <Button
          onClick={() =>
            handleAction(() =>
              createMockNotification(
                "New Test Notification",
                `Created at ${new Date().toLocaleTimeString()}`,
                "system_notification",
                false,
              ),
            )
          }
        >
          Add Single
        </Button>
        <Button
          onClick={() =>
            handleAction(() => markAllAsReadMutation.mutateAsync())
          }
          variant="outline"
        >
          Mark All Read
        </Button>
        <Button
          onClick={() =>
            handleAction(async () => {
              if (
                window.confirm(
                  `Delete all ${notifications.length} notifications?`,
                )
              ) {
                for (const n of notifications)
                  await deleteNotificationMutation.mutateAsync(n.id);
              }
            })
          }
          variant="destructive"
          disabled={!notifications.length}
          className="col-span-2"
        >
          Delete All
        </Button>
      </div>
    </CardContent>
  </Card>
);
