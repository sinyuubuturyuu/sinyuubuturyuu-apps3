const APP_VERSION = "20260322b";

self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil((async function () {
    await self.clients.claim();
    const windowClients = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true
    });

    await Promise.all(windowClients.map(async function (client) {
      try {
        const currentUrl = client.url || "";
        const url = new URL(currentUrl);
        if (!url.href.startsWith(self.registration.scope)) {
          return;
        }

        url.searchParams.set("v", APP_VERSION);
        const nextUrl = url.toString();
        if (currentUrl === nextUrl) {
          return;
        }
        if (typeof client.navigate !== "function") {
          return;
        }
        await client.navigate(nextUrl);
      } catch (error) {
        if (error && error.message && error.message.indexOf("Cannot navigate to URL") !== -1) {
          return;
        }
        console.warn("Failed to refresh window client:", error);
      }
    }));
  })());
});
