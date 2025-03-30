import { useAuth } from "@/hooks/useAuth";
import { Notification as NotificationModel } from "@/modules/shared/notifications/notification";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notificationService } from "../NotificationService";

/**
 * Hook to fetch user notifications
 */
export function useNotifications() {
  const { userData } = useAuth();
  const userId = userData?.uid;

  return useQuery({
    queryKey: ["notifications", userId],
    queryFn: async () => {
      if (!userId) return [];

      try {
        return await notificationService.getUserNotifications(userId);
      } catch (error) {
        console.error("Error fetching notifications:", error);
        throw error;
      }
    },
    enabled: !!userId,
  });
}

/**
 * Hook to get unread notification count
 */
export function useUnreadNotificationCount() {
  const { userData } = useAuth();
  const userId = userData?.uid;

  return useQuery({
    queryKey: ["notifications", "unread", userId],
    queryFn: async () => {
      if (!userId) return 0;

      try {
        return await notificationService.getUnreadCount(userId);
      } catch (error) {
        console.error("Error fetching unread notification count:", error);
        throw error;
      }
    },
    enabled: !!userId,
  });
}

/**
 * Hook to mark a notification as read
 */
export function useMarkNotificationAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) =>
      notificationService.markAsRead(notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => {
      console.error("Error marking notification as read:", error);
    },
  });
}

/**
 * Hook to toggle notification read state
 */
export function useToggleNotificationReadState() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) =>
      notificationService.toggleReadState(notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => {
      console.error("Error toggling notification read state:", error);
    },
  });
}

/**
 * Hook to mark all notifications as read
 */
export function useMarkAllNotificationsAsRead() {
  const queryClient = useQueryClient();
  const { userData } = useAuth();
  const userId = userData?.uid;

  return useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("User not authenticated");
      return notificationService.markAllAsRead(userId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => {
      console.error("Error marking all notifications as read:", error);
    },
  });
}

/**
 * Hook to create a notification (admin or system use)
 */
export function useCreateNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notification: Omit<NotificationModel, "id">) =>
      notificationService.create(notification),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => {
      console.error("Error creating notification:", error);
    },
  });
}

/**
 * Hook to delete a notification (admin or system use)
 */
export function useDeleteNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) =>
      notificationService.delete(notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => {
      console.error("Error deleting notification:", error);
    },
  });
}

/**
 * Hook to save FCM token
 */
export function useSaveFCMToken() {
  return useMutation({
    mutationFn: (token: string) => notificationService.saveFCMToken(token),
    onError: (error) => {
      console.error("Error saving FCM token:", error);
    },
  });
}

/**
 * Hook to remove all FCM tokens
 */
export function useRemoveFCMTokens() {
  return useMutation({
    mutationFn: () => notificationService.removeFCMToken(),
    onError: (error) => {
      console.error("Error removing FCM token:", error);
    },
  });
}

/**
 * Hook to check push notification support
 */
export function useCheckPushSupport() {
  return {
    checkSupport: () => notificationService.checkPushSupport(),
  };
}

/**
 * Hook to get user's FCM tokens with metadata
 */
export function useUserTokens() {
  const { userData } = useAuth();
  const userId = userData?.uid;

  return useQuery({
    queryKey: ["user-tokens", userId],
    queryFn: async () => {
      if (!userId) throw new Error("User not authenticated");
      return notificationService.getUserTokens(userId);
    },
    enabled: !!userId,
  });
}

/**
 * Hook to remove a specific FCM token by ID
 */
export function useRemoveToken() {
  const queryClient = useQueryClient();
  const { userData } = useAuth();
  const userId = userData?.uid;

  return useMutation({
    mutationFn: async (tokenId: string) => {
      if (!userId) throw new Error("User not authenticated");
      return notificationService.removeTokenById(userId, tokenId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-tokens"] });
    },
    onError: (error) => {
      console.error("Error removing FCM token:", error);
    },
  });
}

/**
 * Hook to cleanup FCM tokens
 */
export function useCleanupTokens() {
  const queryClient = useQueryClient();
  const { userData } = useAuth();
  const userId = userData?.uid;

  return useMutation({
    mutationFn: async (maxTokens?: number) => {
      if (!userId) throw new Error("User not authenticated");
      return notificationService.cleanupTokens(userId, maxTokens);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-tokens"] });
    },
    onError: (error) => {
      console.error("Error cleaning up FCM tokens:", error);
    },
  });
}
