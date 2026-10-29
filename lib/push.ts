import webpush from "web-push";
import { VAPID_PUBLIC_KEY } from "./vapid";

export const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY ||
  "wO9ZJ8HK4KOZ0f__8nmUeRKdngqN-3rhm9cccysDOZg";

export const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT || "mailto:admin@budgetvir.app";

let vapidConfigured = false;

function ensureVapidDetails() {
  if (vapidConfigured) return;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  vapidConfigured = true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  badge?: string;
}

export interface SubscriptionRecord {
  id?: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Sends a web push notification to a specific subscriber.
 * Returns true if successful, false if the subscription is dead (404/410).
 */
export async function sendWebPush(
  sub: SubscriptionRecord,
  payload: PushPayload,
): Promise<{ success: boolean; statusCode?: number; shouldRemove: boolean }> {
  ensureVapidDetails();

  const pushSubscription: webpush.PushSubscription = {
    endpoint: sub.endpoint,
    keys: {
      p256dh: sub.p256dh,
      auth: sub.auth,
    },
  };

  try {
    await webpush.sendNotification(
      pushSubscription,
      JSON.stringify(payload),
      {
        TTL: 60 * 60 * 24, // 24 hours
        urgency: "high",
      },
    );
    return { success: true, shouldRemove: false };
  } catch (err: unknown) {
    const error = err as { statusCode?: number; message?: string };
    const statusCode = error.statusCode;

    // 404 Not Found or 410 Gone means the subscription is expired or unsubscribed
    if (statusCode === 404 || statusCode === 410) {
      return { success: false, statusCode, shouldRemove: true };
    }

    return { success: false, statusCode, shouldRemove: false };
  }
}
