/* 刷题机 Service Worker（静态站点） */
var CACHE_CORE = 'cpa-quiz-core-v8';
var CACHE_DATA = 'cpa-quiz-data-v8';
var CORE = ['./', './index.html', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png'];

function scopeURL(path) {
  return new URL(path, self.registration ? self.registration.scope : './').toString();
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_CORE).then(function (cache) { return cache.addAll(CORE); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      var stale = keys.filter(function (k) { return k !== CACHE_CORE && k !== CACHE_DATA; });
      return Promise.all(stale.map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  if (/\/data\/ch\d+\.json$/.test(url.pathname)) {
    // 章节 JSON：cache-first + 后台更新；未命中则网络取并写入缓存
    event.respondWith(
      caches.open(CACHE_DATA).then(function (cache) {
        return cache.match(req).then(function (cached) {
          var network = fetch(req).then(function (resp) {
            if (resp && resp.ok) cache.put(req, resp.clone());
            return resp;
          }).catch(function () { return cached; });
          return cached || network;
        });
      })
    );
    return;
  }

  // 核心壳：cache-first，未命中走网络并回填
  event.respondWith(
    caches.match(req).then(function (cached) {
      return cached || fetch(req).then(function (resp) {
        if (resp && resp.ok) {
          var copy = resp.clone();
          caches.open(CACHE_CORE).then(function (c) { c.put(req, copy); });
        }
        return resp;
      });
    })
  );
});

function notifyAll(payload) {
  self.clients.matchAll().then(function (clients) {
    clients.forEach(function (c) { c.postMessage(payload); });
  });
}

function pad(n) { return n < 10 ? '0' + n : '' + n; }

self.addEventListener('message', function (event) {
  var msg = event.data || {};
  if (msg.type !== 'precache-all') return;
  var chapters = msg.chapters || [];
  caches.open(CACHE_DATA).then(function (cache) {
    var i = 0;
    function next() {
      if (i >= chapters.length) {
        notifyAll({ type: 'precache-done', done: i, total: chapters.length });
        return;
      }
      var ch = chapters[i]; i++;
      var url = scopeURL('data/ch' + pad(ch) + '.json');
      cache.add(url).catch(function () {}).then(function () {
        notifyAll({ type: 'precache-progress', done: i, total: chapters.length });
        next();
      });
    }
    next();
  });
});
