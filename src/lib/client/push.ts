"use client";

import { api, post } from "./api";

export type PushState = "enabled" | "denied" | "unsupported" | "unconfigured" | "insecure";

function base64UrlToBytes(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function registerServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

/**
 * Ask for notification permission and subscribe this device to Web Push, so
 * pings arrive with the phone locked. Must be called from a tap. Needs HTTPS
 * (or localhost); on iPhone the app must be added to the home screen first.
 */
export async function enablePush(): Promise<PushState> {
  if (typeof window === "undefined") return "unsupported";
  if (!window.isSecureContext) return "insecure";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  const reg = await registerServiceWorker();
  if (!reg) return "unsupported";
  const { publicKey } = await api<{ publicKey: string | null }>("/api/push/key");
  if (!publicKey) return "unconfigured";
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) }));
  await post("/api/push/subscribe", sub.toJSON());
  return "enabled";
}

export function pushStatusText(state: PushState | null) {
  switch (state) {
    case "enabled":
      return "Alerts on — you'll be pinged even with the screen locked.";
    case "denied":
      return "Notifications are blocked. Allow them in your browser settings.";
    case "unsupported":
      return "This browser can't show alerts when locked. On iPhone, add this app to your home screen first.";
    case "unconfigured":
      return "Push alerts aren't set up on the server yet.";
    case "insecure":
      return "Lock-screen alerts need the secure (https) address.";
    default:
      return "";
  }
}

/** Keep the screen awake (kitchen display, busy waiter phones). */
export async function keepAwake() {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<unknown> } };
    return await nav.wakeLock?.request("screen");
  } catch {
    return null;
  }
}
