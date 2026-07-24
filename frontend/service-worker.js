const CACHE_VERSION = 'rock-finance-shell-v13';
const APP_SHELL = [
  '/',
  '/index.html',
  '/index.css?v=20260724-2',
  '/modern.css?v=20260724-12',
  '/theme-init.js',
  '/auth.js?v=20260724-7',
  '/app.js?v=20260724-9',
  '/pwa.js?v=20260724-8',
  '/modules/dashboard.js?v=20260724-7',
  '/modules/transactions.js?v=20260724-7',
  '/modules/history.js?v=20260724-7',
  '/modules/chat.js?v=20260724-6',
  '/image/logo2.png',
  '/image/mascot/advisor-welcome.webp',
  '/image/mascot/advisor-thinking.webp',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/manifest.webmanifest?v=20260724-2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('rock-finance-') && key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/')
  ) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put('/index.html', copy));
          }
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      });
      return cached || network;
    })
  );
});
