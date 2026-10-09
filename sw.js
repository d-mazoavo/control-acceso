/* Permite abrir la aplicación sin internet. Los datos (personas, registros) se guardan aparte, en el almacenamiento del navegador. */
var VERSION = 'acceso-v1.2.0';
var FILES = [
  './', 'index.html', 'config.js', 'textos.js', 'manifest.webmanifest', 'css/app.css',
  'js/vendor/msal-browser.min.js', 'js/vendor/jsQR.js', 'js/vendor/qrcode.js', 'js/vendor/read-excel-file.min.js', 'js/vendor/write-excel-file.min.js',
  'js/util.js', 'js/store.js', 'js/schema.js', 'js/backend-graph.js', 'js/backend-demo.js', 'js/sync.js', 'js/pin.js', 'js/horarios.js', 'js/ui.js', 'js/scanner.js',
  'js/app.js', 'js/views-porteria.js', 'js/views-carga.js', 'js/views-consola.js', 'js/views-consola2.js', 'js/views-turno.js', 'js/views-vigilantes.js', 'js/views-horarios.js',
  'img/logo.png', 'img/logo-avo.png', 'img/icon-192.png', 'img/icon-512.png', 'img/apple-touch-icon.png', 'img/favicon.png'
];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Microsoft 365 nunca pasa por la caché
  // Red primero (para recibir actualizaciones); si no hay conexión, se usa la copia guardada.
  var net = Promise.race([fetch(req), new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, 5000); })]);
  e.respondWith(net.then(function (res) {
    if (res && res.ok) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () {
    return caches.match(req, { ignoreSearch: true }).then(function (r) { return r || caches.match('index.html'); });
  }));
});
