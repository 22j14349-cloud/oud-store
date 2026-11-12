// يجعل الموقع قابلاً للتثبيت كتطبيق ويفتح بسرعة. لا يخزّن بيانات قاعدة البيانات.
const CACHE = 'oud-v5';
const CORE = ['./', './index.html', './admin.html', './css/style.css', './css/store.css', './css/admin.css',
  './js/config.js', './js/util.js', './js/db.js', './js/store.js', './js/admin.js', './js/pwa.js',
  './vendor/supabase.js', './vendor/html5-qrcode.min.js', './vendor/JsBarcode.all.min.js', './vendor/chart.umd.js',
  './img/icon-192.png', './img/icon-admin-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Supabase والخطوط تمر مباشرة
  // الشبكة أولاً حتى تصل التحديثات فوراً، والنسخة المخزنة عند انقطاع الإنترنت
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
