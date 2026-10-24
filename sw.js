/* 家宴 Service Worker：缓存应用外壳与菜品图，弱网也能看做法 */
const VERSION = 'jiayan-v7';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/css/app.css',
  './assets/js/app.js',
  './assets/js/ui.js',
  './assets/js/demo-store.js',
  './assets/js/cloud-store.js',
  './assets/js/vendor/supabase.js',
  './assets/js/seed.js',
  './assets/js/config.js',
  './assets/img/app-icon.png',
  './assets/img/hero-table.jpg',
  './assets/img/dish-kungpao.jpg',
  './assets/img/dish-tomato-soup.jpg',
  './assets/img/dish-beef.jpg',
  './assets/img/dish-broccoli.jpg',
  './assets/img/dish-cucumber.jpg',
  './assets/img/dish-wings.jpg',
  './assets/img/dish-tremella.jpg',
  './assets/img/dish-mapo-tofu.jpg',
  './assets/img/dish-steamed-fish.jpg',
  './assets/img/dish-noodles.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  // Supabase 与第三方接口不进缓存
  if (url.origin !== self.location.origin) return;

  // 页面导航：网络优先，断网回退到缓存的首页
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('./index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 脚本与样式：网络优先（保证发版能生效），断网回退缓存
  const isCode = /\.(js|css|mjs|webmanifest)$/.test(url.pathname);
  if (isCode) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // 图片等静态资源：缓存优先，后台更新
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
