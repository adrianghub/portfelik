import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Notification } from "@/modules/shared/notifications/notification";

interface NotificationListDisplayProps {
  notifications: Notification[];
  renderNotification: (notification: Notification) => React.ReactElement;
}

export const NotificationListDisplay = ({
  notifications,
  renderNotification,
}: NotificationListDisplayProps) => (
  <Card className="md:col-span-2">
    <CardHeader>
      <CardTitle>Current Notifications ({notifications.length})</CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      {notifications.length === 0 ? (
        <p className="text-muted-foreground">No notifications found.</p>
      ) : (
        <div className="space-y-2">{notifications.map(renderNotification)}</div>
      )}
    </CardContent>
  </Card>
);
