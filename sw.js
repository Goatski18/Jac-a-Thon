// Nätet först (max 3 s) så att alla får senaste versionen; annars cachen.
// Firebase-biblioteket från gstatic är versionslåst och cachas permanent, så appen startar även offline.
const CACHE = "jac-a-thon-v2";
const SHELL = ["./", "index.html", "config.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (u.origin === "https://www.gstatic.com" && u.pathname.startsWith("/firebasejs/")) {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })));
    return;
  }
  if (u.origin !== location.origin) return;
  const net = fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; });
  const fallback = () => caches.match(e.request, {ignoreSearch: true}).then(r => r || caches.match("index.html"));
  e.respondWith(new Promise(resolve => {
    const t = setTimeout(() => fallback().then(r => r && resolve(r)), 3000);
    net.then(r => { clearTimeout(t); resolve(r); }).catch(() => { clearTimeout(t); fallback().then(resolve); });
  }));
});
