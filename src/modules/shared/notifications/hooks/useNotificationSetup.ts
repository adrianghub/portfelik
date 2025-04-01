import {
  checkNotificationSupport,
  getFCMToken,
  requestNotificationPermission,
} from "@/lib/service-worker";
import { notificationService } from "@/modules/shared/notifications/NotificationService";
import { useEffect } from "react";

import { useState } from "react";

export function useNotificationSetup() {
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermission>(Notification.permission);

  useEffect(() => {
    const { permission } = checkNotificationSupport();
    setNotificationPermission(permission);
  }, []);

  const handleNotificationPermission = async () => {
    try {
      if (notificationPermission === "granted") {
        return;
      }

      const granted = await requestNotificationPermission();
      setNotificationPermission(granted ? "granted" : "denied");

      if (granted) {
        const token = await getFCMToken();
        if (token) await notificationService.saveFCMToken(token);
      } else {
        alert("Please enable notifications in your browser settings.");
      }
    } catch (error) {
      console.error("Error enabling notifications:", error);
      alert("Failed to enable notifications.");
    }
  };

  return { notificationPermission, handleNotificationPermission };
}
