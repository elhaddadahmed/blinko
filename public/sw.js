/* Blinko Service Worker: zeigt Push-Nachrichten an und öffnet beim Antippen die Treuekarte. */
const META = "blinko-meta";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Die Karte meldet ihre Adresse, damit ein Tipp auf die Nachricht sie wieder öffnen kann.
self.addEventListener("message", (event) => {
  const data = event.data;
  if (data && data.type === "card-url" && typeof data.url === "string" && data.url.startsWith("/karte/")) {
    event.waitUntil(caches.open(META).then((c) => c.put("/__card_url", new Response(data.url))));
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Blinko", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag || "blinko",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const cache = await caches.open(META);
      const saved = await cache.match("/__card_url");
      const url = saved ? await saved.text() : "/";
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of windows) {
        if ("focus" in w) return w.focus();
      }
      return self.clients.openWindow(url);
    })()
  );
});
