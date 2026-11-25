// Phone alerts for parents: Web Push (works with the app closed) plus sound, vibration and
// a local notification while the app is open.
import { api } from "@/lib/api";

export function notificationsSupported() {
  return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;
}

export function pushSupported() {
  return notificationsSupported() && "PushManager" in window;
}

// iPhones only allow notifications for web apps added to the Home Screen.
export function needsHomeScreenInstall() {
  if (typeof window === "undefined") return false;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
  return ios && !standalone;
}

function base64UrlToBytes(value) {
  const padded = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

/** Asks for permission (from a button tap) and registers this phone for push alerts. */
export async function enablePhoneAlerts() {
  if (!notificationsSupported()) return { state: "unsupported" };
  const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (permission !== "granted") return { state: permission };
  if (!pushSupported()) return { state: "granted", push: false };
  const { publicKey } = await api.pushKey();
  if (!publicKey) return { state: "granted", push: false };
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(publicKey),
    });
  }
  await api.pushSubscribe(subscription.toJSON());
  return { state: "granted", push: true };
}

export async function currentPushState() {
  if (!notificationsSupported()) return "unsupported";
  if (Notification.permission !== "granted") return Notification.permission;
  if (!pushSupported()) return "granted";
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  return subscription ? "subscribed" : "granted";
}

export async function unsubscribeFromPush() {
  if (!pushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await api.pushUnsubscribe(subscription.endpoint).catch(() => {});
  await subscription.unsubscribe().catch(() => {});
}

export function buzz(pattern = [160, 80, 160]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* vibration is optional */
  }
}

export function chime() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const now = context.currentTime;
    [880, 1180].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + index * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.25, now + index * 0.18 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.18 + 0.35);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now + index * 0.18);
      oscillator.stop(now + index * 0.18 + 0.4);
    });
    setTimeout(() => context.close().catch(() => {}), 1200);
  } catch {
    /* sound is optional */
  }
}

// Same tag as the push notification, so the phone shows one alert, not two.
export async function showLocalNotification(notice) {
  if (!notificationsSupported() || Notification.permission !== "granted") return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    await registration?.showNotification(notice.title, {
      body: notice.body,
      icon: "/icon.svg",
      badge: "/icon.svg",
      tag: `cp-${notice.id}`,
      data: { url: "/parent" },
    });
  } catch {
    /* a toast is still shown in the app */
  }
}
