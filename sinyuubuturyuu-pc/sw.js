const APP_VERSION = "20260419a";
const VERSION_PARAM = "v";

self.addEventListener("install", function (event) {
  event.waitUntil(Promise.resolve(self.skipWaiting()));
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
        const nextUrl = getVersionedClientUrl(client.url || "");
        if (!nextUrl || client.url === nextUrl) {
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

function getVersionedClientUrl(currentUrl) {
  if (!currentUrl) {
    return "";
  }

  const url = new URL(currentUrl);
  if (!url.href.startsWith(self.registration.scope)) {
    return "";
  }

  // This worker intentionally avoids CacheStorage and only nudges open pages to the latest release URL.
  url.searchParams.set(VERSION_PARAM, APP_VERSION);
  return url.toString();
}
