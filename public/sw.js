// CampusPulse service worker: installable app, offline shell, and push notifications for parents.
const CACHE = "campuspulse-v2";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Personal data from the API is never cached.
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put("/index.html", copy)).catch(() => {});
          }
          return response;
        })
        .catch(async () => (await caches.match("/index.html")) || Response.error()),
    );
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
            }
            return response;
          }),
      ),
    );
  }
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "CampusPulse", body: event.data ? event.data.text() : "" };
  }
  const sos = payload.type === "sos";
  const show = self.registration.showNotification(payload.title || "CampusPulse", {
    body: payload.body || "",
    icon: "/icon.svg",
    badge: "/icon.svg",
    tag: payload.id ? `cp-${payload.id}` : "campuspulse",
    renotify: sos,
    requireInteraction: sos,
    vibrate: sos ? [400, 150, 400, 150, 400] : [200, 100, 200],
    data: { url: payload.url || "/parent" },
  });
  // Tell the server when the alert reached this phone (notification response time).
  const ack = payload.id
    ? fetch("/api/notifications/ack", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [payload.id] }),
      }).catch(() => {})
    : Promise.resolve();
  event.waitUntil(Promise.all([show, ack]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if ("focus" in client) {
          await client.navigate(target).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })(),
  );
});
