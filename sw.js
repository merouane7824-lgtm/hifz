// Hifz — service worker : l'appli s'ouvre même hors connexion.
var VERSION = 'hifz-v6';
var COQUILLE = ['./', 'index.html', 'styles.css', 'app.js', 'data.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/apple-touch-icon.png', 'widget/hifz-widget.js'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(COQUILLE); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (cles) {
    return Promise.all(cles.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  // Fichiers de l'appli : réseau d'abord (pour recevoir les mises à jour), cache si hors connexion.
  if (url.origin === self.location.origin) {
    e.respondWith(fetch(req).then(function (rep) {
      var copie = rep.clone();
      caches.open(VERSION).then(function (c) { c.put(req, copie); });
      return rep;
    }).catch(function () {
      return caches.match(req).then(function (r) { return r || caches.match('index.html'); });
    }));
    return;
  }
  // Polices : cache d'abord.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.match(req).then(function (r) {
      return r || fetch(req).then(function (rep) {
        var copie = rep.clone();
        caches.open(VERSION).then(function (c) { c.put(req, copie); });
        return rep;
      });
    }));
  }
});
