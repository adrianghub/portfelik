import {
  useDeleteNotification,
  useMarkAllNotificationsAsRead,
  useMarkNotificationAsRead,
  useNotifications,
  useToggleNotificationReadState,
  useUnreadNotificationCount,
} from "../useNotificationsQuery";

/**
 * Custom hook that provides all notification-related actions and data
 * to be reused across different notification components
 */
export function useNotificationActions() {
  const {
    data: notifications = [],
    isLoading,
    refetch: refreshNotifications,
  } = useNotifications();

  const { data: unreadCount = 0 } = useUnreadNotificationCount();

  const markAsRead = useMarkNotificationAsRead();
  const markAllAsRead = useMarkAllNotificationsAsRead();
  const toggleReadState = useToggleNotificationReadState();
  const deleteNotification = useDeleteNotification();

  const handleMarkAsRead = async (id: string) => {
    try {
      await markAsRead.mutateAsync(id);
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
    }
  };

  const handleToggleReadState = async (id: string) => {
    try {
      await toggleReadState.mutateAsync(id);
    } catch (error) {
      console.error("Failed to toggle notification read state:", error);
    }
  };

  const handleDeleteNotification = async (id: string) => {
    try {
      await deleteNotification.mutateAsync(id);
    } catch (error) {
      console.error("Failed to delete notification:", error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllAsRead.mutateAsync();
    } catch (error) {
      console.error("Failed to mark all notifications as read:", error);
    }
  };

  return {
    notifications,
    isLoading,
    unreadCount,
    refreshNotifications,
    handleMarkAsRead,
    handleToggleReadState,
    handleDeleteNotification,
    handleMarkAllAsRead,
  };
}
