import { supabase } from "@/lib/supabase";

/** Public VAPID key; push stays off (UI says so) until it's configured. */
export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function pushConfigured() {
  return Boolean(VAPID_PUBLIC_KEY);
}

function keyBytes(base64url: string) {
  const padded = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration("/");
  return (await registration?.pushManager.getSubscription()) || null;
}

/** Owner tap only: asks permission, subscribes this device and stores it for the signed-in account. */
export async function enablePush(): Promise<string> {
  if (!pushSupported()) return "This browser can't receive notifications.";
  if (!pushConfigured()) return "Notifications aren't set up yet.";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "Notifications are blocked. Allow them in your browser settings.";
  const registration = await navigator.serviceWorker.ready;
  const subscription = (await registration.pushManager.getSubscription()) || (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }));
  const json = subscription.toJSON();
  await supabase.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
  const { error } = await supabase.from("push_subscriptions").insert({ endpoint: subscription.endpoint, subscription: json, user_agent: navigator.userAgent.slice(0, 200) });
  if (error) return "Could not save this device. Try again.";
  return "";
}

export async function disablePush(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;
  await supabase.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
  await subscription.unsubscribe().catch(() => false);
}
