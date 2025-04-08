type UserRole = "user" | "admin";

export interface User {
  uid: string;
  email: string | null;
  role: UserRole;
  createdAt: Date;
  lastLoginAt: Date;
  fcmTokens?: string[];
  tokenMetadata: Record<string, object>;
  settings?: {
    notificationsEnabled?: boolean;
  };
}
