// Офлайн-кэш: оболочка и фото сразу, афиша и погода по сети с запасным кэшем, плитки карты по мере просмотра.
const VERSION = "v1-2026-10-12";
const SHELL = ["./", "index.html", "css/app.css", "js/app.js", "js/data.js", "vendor/leaflet.js", "vendor/leaflet.css", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "data/events.json", "data/cinema.json"];
const IMGS = ["img/alpha-1.jpg", "img/alpha-2.jpg", "img/amberd-1.jpg", "img/amberd-2.jpg", "img/areni-1.jpg", "img/areni-2.jpg", "img/azat-1.jpg", "img/azat-2.jpg", "img/brandy-1.jpg", "img/brandy-2.jpg", "img/cafs-1.jpg", "img/cafs-2.jpg", "img/casc-1.jpg", "img/casc-2.jpg", "img/charents-1.jpg", "img/cinema-1.jpg", "img/cinema-2.jpg", "img/devil-1.jpg", "img/devil-2.jpg", "img/dilijan-1.jpg", "img/dilijan-2.jpg", "img/dimats-1.jpg", "img/dimats-2.jpg", "img/echm-2.jpg", "img/garni-1.jpg", "img/garni-2.jpg", "img/geghard-1.jpg", "img/geghard-2.jpg", "img/goris-1.jpg", "img/gosh-1.jpg", "img/gutan-1.jpg", "img/gutan-2.jpg", "img/gyumri-1.jpg", "img/hagh-1.jpg", "img/hagh-2.jpg", "img/ijevan-1.jpg", "img/kari-1.jpg", "img/kari-2.jpg", "img/kecharis-1.jpg", "img/kecharis-2.jpg", "img/khor-1.jpg", "img/khor-2.jpg", "img/khustup-1.jpg", "img/khustup-2.jpg", "img/kond-1.jpg", "img/kond-2.jpg", "img/levon-1.jpg", "img/levon-2.jpg", "img/lost-2.jpg", "img/makar-1.jpg", "img/makar-2.jpg", "img/mosque-2.jpg", "img/mother-1.jpg", "img/mother-2.jpg", "img/nora-1.jpg", "img/nora-2.jpg", "img/north-1.jpg", "img/opera-1.jpg", "img/opera-2.jpg", "img/parz-1.jpg", "img/prosh-1.jpg", "img/prosh-2.jpg", "img/quba-1.jpg", "img/redbr-1.jpg", "img/redbr-2.jpg", "img/rep-1.jpg", "img/saghm-1.jpg", "img/saghm-2.jpg", "img/saryan-1.jpg", "img/saryan-2.jpg", "img/sevan-1.jpg", "img/sevan-2.jpg", "img/shaki-1.jpg", "img/shaki-2.jpg", "img/symph-1.jpg", "img/symph-2.jpg", "img/tatev-1.jpg", "img/tatev-2.jpg", "img/tsagh_atv-1.jpg", "img/tsagh_atv-2.jpg", "img/tsagh_rope-1.jpg", "img/tsits-1.jpg", "img/tsits-2.jpg", "img/verni-1.jpg", "img/verni-2.jpg", "img/victory-1.jpg", "img/victory-2.jpg", "img/wings-1.jpg", "img/wings-2.jpg", "img/yell-1.jpg", "img/yell-2.jpg", "img/zvart-1.jpg", "img/zvart-2.jpg"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open("shell-" + VERSION).then(c => c.addAll(SHELL)).then(() => caches.open("img-" + VERSION)).then(c => c.addAll(IMGS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => !k.endsWith(VERSION) && k !== "tiles").map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
async function trimTiles(){ const c = await caches.open("tiles"); const keys = await c.keys(); for (let i = 0; i < keys.length - 600; i++) await c.delete(keys[i]); }
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.hostname === "tile.openstreetmap.org"){
    e.respondWith(caches.open("tiles").then(async c => { const hit = await c.match(e.request); if (hit) return hit;
      try { const r = await fetch(e.request); if (r.ok) { c.put(e.request, r.clone()); trimTiles(); } return r; } catch(err){ return hit || Response.error(); } }));
    return;
  }
  const networkFirst = url.pathname.endsWith("events.json") || url.hostname === "api.open-meteo.com" || url.pathname.endsWith("/") || url.pathname.endsWith("index.html") || url.pathname.endsWith(".js") || url.pathname.endsWith(".css");
  if (url.origin === location.origin || url.hostname === "api.open-meteo.com" || url.hostname.includes("fonts.g")){
    if (networkFirst){
      e.respondWith(fetch(e.request).then(r => { if (r.ok){ const cp = r.clone(); caches.open("shell-" + VERSION).then(c => c.put(e.request, cp)); } return r; }).catch(() => caches.match(e.request)));
    } else {
      e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => { if (r.ok){ const cp = r.clone(); caches.open("shell-" + VERSION).then(c => c.put(e.request, cp)); } return r; })));
    }
  }
});
