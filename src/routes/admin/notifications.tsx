import { useAuth } from "@/lib/AuthContext";
import { createAdminLoader } from "@/lib/ProtectedRoute";
import { CloudFunctionTestPanel } from "@/modules/admin/notifications/CloudFunctionTestPanel";
import { NotificationControls } from "@/modules/admin/notifications/NotificationControls";
import { NotificationItem } from "@/modules/admin/notifications/NotificationItem";
import { NotificationListDisplay } from "@/modules/admin/notifications/NotificationListDisplay";
import { PushNotificationTestsPanel } from "@/modules/admin/notifications/PushNotificationTestsPanel";
import {
  useCheckPushSupport,
  useDeleteNotification,
  useMarkAllNotificationsAsRead,
  useNotifications,
  useRemoveFCMTokens,
  useSaveFCMToken,
  useToggleNotificationReadState,
} from "@/modules/shared/notifications/useNotificationsQuery";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

const ENV = import.meta.env;
const FUNCTION_URL = ENV.DEV
  ? "http://localhost:5001/portfelik-888dd/us-central1/sendAdminTransactionSummaryManual"
  : "https://us-central1-portfelik-888dd.cloudfunctions.net/sendAdminTransactionSummaryManual";

export const Route = createFileRoute("/admin/notifications")({
  component: AdminNotificationsManagerView,
  loader: createAdminLoader(),
});

function AdminNotificationsManagerView() {
  const { userData } = useAuth();
  const { data: notifications = [], refetch: fetchNotifications } =
    useNotifications();
  const markAllAsRead = useMarkAllNotificationsAsRead();
  const { checkSupport } = useCheckPushSupport();
  const saveFCMToken = useSaveFCMToken();
  const removeFCMTokens = useRemoveFCMTokens();
  const deleteNotification = useDeleteNotification();
  const toggleReadState = useToggleNotificationReadState();

  const [loading, setLoading] = useState(false);

  const handleCloudFunctionCall = async () => {
    if (!userData?.uid)
      return alert("You must be logged in to test the cloud function");

    setLoading(true);
    try {
      const params = new URLSearchParams({
        userId: userData.uid,
        title: "Test Cloud Function",
        body: "This is a test notification sent via Firebase Cloud Functions",
        type: "admin_transaction_summary",
      });
      const response = await fetch(`${FUNCTION_URL}?${params.toString()}`);
      const data = await response.json();
      alert(data.success ? `Success: ${data.message}` : `Error: ${data.error}`);
      fetchNotifications();
    } catch (error) {
      console.error("Cloud function error:", error);
      alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (
    action: () => Promise<unknown>,
    successMessage?: string,
  ) => {
    try {
      await action();
      if (successMessage) alert(successMessage);
      fetchNotifications();
    } catch (error) {
      console.error("Notification action error:", error);
      alert("Action failed. See console for details.");
    }
  };

  return (
    <div className="py-6 px-4 md:px-6">
      <h1 className="text-2xl font-bold mb-6">Admin Notifications Test Page</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <NotificationControls
          fetchNotifications={fetchNotifications}
          handleAction={handleAction}
          notifications={notifications}
          markAllAsReadMutation={markAllAsRead}
          deleteNotificationMutation={deleteNotification}
        />
        <CloudFunctionTestPanel
          handleCloudFunctionCall={handleCloudFunctionCall}
          loading={loading}
        />
        <PushNotificationTestsPanel
          handleAction={handleAction}
          checkSupport={checkSupport}
          saveFCMTokenMutation={saveFCMToken}
          removeFCMTokensMutation={removeFCMTokens}
        />
        <NotificationListDisplay
          notifications={notifications}
          renderNotification={(notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              handleAction={handleAction}
              toggleReadStateMutation={toggleReadState}
              deleteNotificationMutation={deleteNotification}
            />
          )}
        />
      </div>
    </div>
  );
}
