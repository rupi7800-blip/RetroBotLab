// Service worker di RETRO BOT LAB: rende l'app installabile e carica l'interfaccia anche con rete instabile.
// I dati (/api) e il simulatore (/mock) non vengono MAI salvati in cache: arrivano sempre dal server.
const VERSION = 'rbl-v2';
const SHELL = [
  '/', '/index.html', '/css/app.css', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png',
  '/js/app.js', '/js/ui.js', '/js/editor.js', '/js/qr.js',
  '/js/views/home.js', '/js/views/generator.js', '/js/views/projects.js', '/js/views/project.js', '/js/views/assistant.js',
  '/js/views/commands.js', '/js/views/debug.js', '/js/views/test.js', '/js/views/knowledge.js', '/js/views/learn.js',
  '/js/views/guide.js', '/js/views/settings.js', '/js/views/mobile.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/mock/')) return; // sempre dalla rete
  // rete prima, cache come riserva: le modifiche all'app sono visibili subito quando il server è raggiungibile
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request).then((hit) => hit || (e.request.mode === 'navigate' ? caches.match('/index.html') : Response.error()))),
  );
});
