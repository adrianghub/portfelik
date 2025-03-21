import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface CloudFunctionTestProps {
  handleCloudFunctionCall: () => Promise<void>;
  loading: boolean;
}

export const CloudFunctionTestPanel = ({
  handleCloudFunctionCall,
  loading,
}: CloudFunctionTestProps) => (
  <Card>
    <CardHeader>
      <CardTitle>Cloud Function Test</CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      <Button
        onClick={handleCloudFunctionCall}
        disabled={loading}
        className="w-full"
      >
        {loading ? "Sending..." : "Send Test Notification via Cloud Function"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Triggers the cloud function to create and push a notification.
      </p>
    </CardContent>
  </Card>
);
