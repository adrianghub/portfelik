# Notifications System

The Portfelik notification system provides in-app and push notifications for users and management panel for admins.

## Architecture

The notification system consists of:

1. **Firestore Database** - Stores notification records in the `notifications` collection
2. **React Components**
   - `NotificationsPopover` - UI component for displaying the notification bell and popover
   - `NotificationList` - Renders the list of notifications with read/unread status
3. **Core Services**
   - `NotificationService` - Service class for CRUD operations on notifications
   - `useNotificationsQuery` - React Query hooks for data fetching and mutations
4. **Firebase Cloud Functions**
   - Scheduled functions for sending automated notifications (e.g., daily transaction summaries)
   - Manual trigger functions for testing
5. **FCM Integration** - Firebase Cloud Messaging for push notifications

## Data Model

Notifications follow this data structure:
```typescript
interface Notification {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: NotificationType;  // "transaction_summary" | "system_notification"
  read: boolean;
  createdAt: string;
  data?: Record<string, unknown>;
}
```

## Data Fetching

The system uses React Query for efficient data fetching:

- `useNotifications` - Fetches user's notifications
- `useUnreadNotificationCount` - Gets count of unread notifications
- `useMarkNotificationAsRead` - Marks a notification as read
- `useToggleNotificationReadState` - Toggles read/unread state
- `useMarkAllNotificationsAsRead` - Marks all user notifications as read
- `useDeleteNotification` - Deletes a notification

## Push Notifications

Push notifications are implemented using Firebase Cloud Messaging (FCM) and require:

1. User permission consent
2. FCM token registration
3. Service worker support
4. Secure context (HTTPS or localhost)

## Firebase Cloud Functions

The system uses cloud functions for:

1. `sendAdminTransactionSummary` - Scheduled daily to send transaction summaries
2. `sendAdminTransactionSummaryManual` - HTTP endpoint for manual testing
3. `sendTransactionSummary` - Scheduled daily to send transaction summaries (SKIPPED FOR NOW)
4. `sendTransactionSummaryManual` - HTTP endpoint for manual testing (SKIPPED FOR NOW)

## Future Enhancements

Potential enhancements to the notification system:
- Real-time updates using Firebase listeners
- Custom notification sounds
- Notification categories and filters
- Batch actions (delete multiple, etc.)
- Additional scheduled notifications for other events
- User preferences for notification frequency and types
- Rich media notifications with images or interactive elements
- Notification analytics to track open rates and engagement
- Background sync for offline notification delivery
- Notification grouping for better organization
- Deep linking to specific app sections from notifications
- Multi-device notification synchronization
- Notification templates for consistent messaging