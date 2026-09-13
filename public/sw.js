// Service worker for staff devices: shows Web Push alerts when the app is in
// the background or the phone is locked, and opens the right screen on tap.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Istanbul Cafe & Restaurant", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // When the app is on screen it already beeps via the live connection.
      if (windows.some((w) => w.focused)) return;
      await self.registration.showNotification(data.title || "Istanbul Cafe & Restaurant", {
        body: data.body || "",
        tag: `${data.kind || "info"}:${data.title || ""}`,
        renotify: true,
        requireInteraction: data.kind === "alert",
        vibrate: [200, 100, 200, 100, 300],
        icon: "/pwa-icon/192",
        badge: "/pwa-icon/96",
        data: { url: data.url || "/staff" },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/staff", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of windows) {
        if (new URL(w.url).pathname.startsWith(new URL(url).pathname)) {
          await w.focus();
          if ("navigate" in w) await w.navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
