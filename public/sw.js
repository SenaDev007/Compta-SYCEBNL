const PREFIX = "compta-sycebnl";
const SHELL_CACHE = `${PREFIX}-shell-v2`;
const ASSET_CACHE = `${PREFIX}-assets-v2`;
const SHELL_ASSETS = [
  "/manifest.webmanifest",
  "/icon.svg",
  "/logo-compta-sycebnl.png",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-512-maskable.png",
  "/apple-touch-icon.png",
];

async function cacheApplicationShell() {
  const response = await fetch("/", { cache: "reload" });
  if (!response.ok) throw new Error("application_shell_unavailable");
  const html = await response.clone().text();
  const scriptAndStyleAssets = [
    ...html.matchAll(/(?:src|href)=["']([^"']*\/_next\/static\/[^"']+)["']/g),
  ]
    .map((match) => new URL(match[1], self.location.origin))
    .filter(
      (url) => url.origin === self.location.origin && url.pathname.startsWith("/_next/static/"),
    )
    .map((url) => url.href);

  const shellCache = await caches.open(SHELL_CACHE);
  const assetCache = await caches.open(ASSET_CACHE);
  await shellCache.put("/", response.clone());
  await assetCache.addAll([...SHELL_ASSETS, ...new Set(scriptAndStyleAssets)]);
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheApplicationShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key.startsWith(`${PREFIX}-`) && ![SHELL_CACHE, ASSET_CACHE].includes(key),
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_next/data/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.ok && url.pathname === "/") {
            const cache = await caches.open(SHELL_CACHE);
            await cache.put("/", response.clone());
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(SHELL_CACHE);
          return (
            (await cache.match("/")) ||
            new Response(
              "Connexion indisponible. Ouvrez l’application après une première visite en ligne.",
              {
                status: 503,
                headers: { "Content-Type": "text/plain; charset=utf-8" },
              },
            )
          );
        }),
    );
    return;
  }

  if (
    url.pathname.startsWith("/_next/static/") ||
    /\.(?:png|svg|webmanifest|woff2?)$/i.test(url.pathname)
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      })(),
    );
  }
});
