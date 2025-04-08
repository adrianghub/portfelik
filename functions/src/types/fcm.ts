export interface MessagingResponse {
  success: boolean;
  error?: {
    code: string;
    message: string;
  };
}

export interface FCMNotificationPayload {
  title: string;
  body: string;
}

export interface FCMDataPayload {
  [key: string]: string;
}
