import { useNotificationInitializer } from "@/modules/shared/notifications/useNotificationsInitializer";
import { ReactNode } from "react";
export function NotificationsProvider({ children }: { children: ReactNode }) {
  useNotificationInitializer();

  return <>{children}</>;
}
