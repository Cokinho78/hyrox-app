// Cache de l'app pour qu'elle s'ouvre sans réseau. Stratégie : réseau d'abord
// (les mises à jour arrivent tout de suite), cache en secours. Les appels à
// l'API GitHub ne passent pas par ici (gérés par le cache de store.js).
const CACHE = "hyrox-shell-v2";
const CHART = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([
    "./", "./index.html", "./style.css", "./js/app.js", "./js/store.js", "./js/util.js",
    "./js/charts.js", "./manifest.webmanifest", "./icons/icon-192.png", CHART,
  ])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  const mine = url.origin === location.origin && !url.pathname.startsWith("/api/");
  if (e.request.method !== "GET" || !(mine || url.href === CHART || url.host.includes("fonts.g"))) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
