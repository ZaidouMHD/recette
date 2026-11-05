// Fonctionnement hors connexion : l'app et le moteur de lecture restent en cache.
const VERSION = 'recette-v6';
const SHELL = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest',
  'js/ingredients-db.js', 'js/parser.js', 'js/store.js', 'js/scan.js', 'js/sync.js', 'js/gemini.js', 'js/app.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/apple-touch-icon.png',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION && k !== 'recette-cdn').map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Moteur Tesseract + langue française : cache permanent après le 1er téléchargement
  if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(caches.open('recette-cdn').then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  // Fichiers de l'app : réseau d'abord (mises à jour), cache si hors ligne
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then((r) => r || caches.match('index.html'))));
});
