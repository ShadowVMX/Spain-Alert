// Service worker mínimo: hace la app instalable (PWA) y deja preparado el hueco
// para cachear el shell offline y para push notifications reales en el futuro
// (requeriría un backend con VAPID keys y suscripciones push por usuario).
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  self.clients.claim();
});

self.addEventListener("fetch", () => {
  // Sin caché offline todavía: los datos de sensores deben ser siempre en vivo.
});
