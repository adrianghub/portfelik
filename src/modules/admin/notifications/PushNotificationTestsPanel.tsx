import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getFCMToken,
  requestNotificationPermission,
} from "@/lib/service-worker";
import type {
  useCheckPushSupport,
  useSaveFCMToken,
} from "@/modules/shared/notifications/hooks/useNotificationsQuery";

import type { useRemoveFCMTokens } from "@/modules/shared/notifications/hooks/useNotificationsQuery";

interface PushNotificationTestsPanelProps {
  handleAction: (
    action: () => Promise<unknown>,
    successMessage?: string,
  ) => Promise<void>;
  checkSupport: () => ReturnType<
    ReturnType<typeof useCheckPushSupport>["checkSupport"]
  >;
  saveFCMTokenMutation: ReturnType<typeof useSaveFCMToken>;
  removeFCMTokensMutation: ReturnType<typeof useRemoveFCMTokens>;
}

export const PushNotificationTestsPanel = ({
  handleAction,
  checkSupport,
  saveFCMTokenMutation,
  removeFCMTokensMutation,
}: PushNotificationTestsPanelProps) => (
  <Card>
    <CardHeader>
      <CardTitle>Push Notification Tests</CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Button
          onClick={() => alert(JSON.stringify(checkSupport(), null, 2))}
          variant="secondary"
        >
          Check Support
        </Button>
        <Button
          onClick={() => handleAction(requestNotificationPermission)}
          variant="secondary"
        >
          Request Permission
        </Button>
        <Button
          onClick={async () => {
            const token = await getFCMToken();
            alert(token ? `FCM Token: ${token.slice(0, 10)}...` : "No token");
          }}
          variant="secondary"
        >
          Get FCM Token
        </Button>
        <Button
          onClick={async () => {
            const token = await getFCMToken();
            if (token)
              await handleAction(
                () => saveFCMTokenMutation.mutateAsync(token),
                "Token saved",
              );
            else alert("No token to save");
          }}
          variant="secondary"
        >
          Save FCM Token
        </Button>
        <Button
          onClick={() =>
            handleAction(
              () => removeFCMTokensMutation.mutateAsync(),
              "Token removed",
            )
          }
          variant="secondary"
        >
          Remove FCM Token
        </Button>
      </div>
    </CardContent>
  </Card>
);
