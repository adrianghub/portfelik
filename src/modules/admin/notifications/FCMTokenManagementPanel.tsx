import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FCMTokenMetadata } from "@/modules/shared/notifications/NotificationService";
import {
  useCleanupTokens,
  useRemoveToken,
  useUserTokens,
} from "@/modules/shared/notifications/hooks/useNotificationsQuery";
import dayjs from "dayjs";
import {
  Loader2,
  Monitor,
  MonitorSmartphone,
  Smartphone,
  Trash2,
} from "lucide-react";

interface FCMTokenManagementPanelProps {
  handleAction: (
    action: () => Promise<unknown>,
    successMessage?: string,
  ) => Promise<void>;
}

export const FCMTokenManagementPanel = ({
  handleAction,
}: FCMTokenManagementPanelProps) => {
  const { data, isLoading, refetch } = useUserTokens();
  const removeToken = useRemoveToken();
  const cleanupTokens = useCleanupTokens();

  const tokens = data?.tokens || [];
  const metadata = data?.metadata || {};

  const getDeviceIcon = (deviceType: string) => {
    switch (deviceType) {
      case "mobile":
        return <Smartphone className="h-4 w-4 mr-2" />;
      case "tablet":
        return <MonitorSmartphone className="h-4 w-4 mr-2" />;
      case "desktop":
      default:
        return <Monitor className="h-4 w-4 mr-2" />;
    }
  };

  const handleRemoveToken = (tokenId: string, deviceName: string) => {
    handleAction(
      () => removeToken.mutateAsync(tokenId),
      `Token removed for device: ${deviceName}`,
    );
  };

  const handleCleanupTokens = () => {
    handleAction(
      () => cleanupTokens.mutateAsync(5),
      "Tokens cleaned up successfully",
    );
  };

  const sortedTokens = [...tokens].sort((a, b) => {
    const aMetadata = metadata[a] || {};
    const bMetadata = metadata[b] || {};

    // Compare by date (most recent first)
    const aDate = aMetadata.lastUsed || aMetadata.createdAt || "";
    const bDate = bMetadata.lastUsed || bMetadata.createdAt || "";

    return aDate > bDate ? -1 : 1;
  });

  return (
    <Card className="md:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>FCM Token Management ({tokens.length})</CardTitle>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Refresh"
            )}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleCleanupTokens}
            disabled={cleanupTokens.isPending || tokens.length === 0}
          >
            {cleanupTokens.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Cleanup Old Tokens"
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : tokens.length === 0 ? (
          <p className="text-muted-foreground py-4">
            No FCM tokens found for this user.
          </p>
        ) : (
          <div className="space-y-3">
            {sortedTokens.map((token) => {
              const tokenMeta = metadata[token] || ({} as FCMTokenMetadata);
              const deviceName = tokenMeta.deviceName || "Unknown Device";
              const deviceType = tokenMeta.deviceType || "unknown";
              const lastUsed = tokenMeta.lastUsed || tokenMeta.createdAt || "";
              const interactionCount = tokenMeta.interactionCount || 0;

              return (
                <div key={token} className="border rounded-md p-3 bg-card">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium flex items-center">
                        {getDeviceIcon(deviceType)}
                        {deviceName}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        <p>Device Type: {deviceType}</p>
                        <p>
                          Last Used:{" "}
                          {lastUsed ? dayjs(lastUsed).fromNow() : "Unknown"}
                        </p>
                        <p>Interaction Count: {interactionCount}</p>
                      </div>
                      <div className="mt-2 text-xs font-mono text-muted-foreground truncate max-w-96">
                        {token.substring(0, 25)}...
                        {token.substring(token.length - 10)}
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemoveToken(token, deviceName)}
                      disabled={removeToken.isPending}
                      title="Remove token"
                    >
                      {removeToken.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
