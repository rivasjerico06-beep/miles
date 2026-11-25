// Parent notifications: stored in the database (in-app) and pushed to subscribed phones.
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { sendNotification, setVapidDetails } from "web-push";
import { notifications, pushSubscriptions } from "../db/schema.js";
import { runInBackground } from "../http.js";

let vapidState = null;

function pushConfigured() {
  if (vapidState !== null) return vapidState;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return (vapidState = false);
  const subject =
    process.env.VAPID_SUBJECT ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://localhost");
  setVapidDetails(subject, publicKey, privateKey);
  return (vapidState = true);
}

export function pushPublicKey() {
  return pushConfigured() ? process.env.VAPID_PUBLIC_KEY : null;
}

/**
 * Creates an in-app notification for the student's linked parent and pushes it to the
 * parent's phones in the background. Returns null when no parent is linked yet.
 */
export async function notifyParent(db, student, { type, title, body = "", mapsUrl = null, eventAt = new Date() }) {
  if (!student?.parentUserId) return null;
  const [row] = await db
    .insert(notifications)
    .values({ parentUserId: student.parentUserId, studentId: student.id, type, title, body, mapsUrl, eventAt })
    .returning();
  runInBackground(() => sendPush(db, row));
  return row;
}

async function sendPush(db, notification) {
  const mark = (pushStatus) =>
    db.update(notifications).set({ pushStatus, pushSentAt: new Date() }).where(eq(notifications.id, notification.id));

  if (!pushConfigured()) return mark("disabled");
  const subscriptions = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, notification.parentUserId));
  if (subscriptions.length === 0) return mark("no_subscription");

  const payload = JSON.stringify({
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    url: "/parent",
  });

  let sent = 0;
  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          payload,
          { TTL: 6 * 60 * 60, urgency: "high", timeout: 8000 },
        );
        sent += 1;
        await db
          .update(pushSubscriptions)
          .set({ lastSuccessAt: new Date(), failureCount: 0 })
          .where(eq(pushSubscriptions.id, subscription.id));
      } catch (error) {
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscription.id));
        } else {
          console.error("[push]", error?.statusCode || "", error?.body || error?.message);
          await db
            .update(pushSubscriptions)
            .set({ failureCount: sql`${pushSubscriptions.failureCount} + 1` })
            .where(eq(pushSubscriptions.id, subscription.id));
        }
      }
    }),
  );
  return mark(sent === subscriptions.length ? "sent" : sent > 0 ? "partial" : "failed");
}

// First arrival of a notification on the parent's phone (push or in-app). Later calls change nothing.
export async function markDelivered(db, parentUserId, ids, via) {
  if (!ids.length) return;
  await db
    .update(notifications)
    .set({ deliveredAt: new Date(), deliveredVia: via })
    .where(
      and(eq(notifications.parentUserId, parentUserId), inArray(notifications.id, ids), isNull(notifications.deliveredAt)),
    );
}

export async function savePushSubscription(db, userId, subscription, userAgent) {
  const values = {
    userId,
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    userAgent: userAgent?.slice(0, 300) || null,
    failureCount: 0,
  };
  await db
    .insert(pushSubscriptions)
    .values(values)
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: values });
}

export async function removePushSubscription(db, userId, endpoint) {
  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
}
