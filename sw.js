/* ===== 英语大师 Service Worker =====
 * PWA 离线支持 (GitHub Pages 部署, iOS Safari / Chrome 安装)
 *
 * 缓存策略:
 *  - 应用外壳 (index.html / css / js / manifest / icons): cache-first, 后台更新
 *  - 数据文件 (data/*.json): cache-first + 后台重新验证 (离线可用, 在线时更新)
 *  - 导航请求: 回退到 index.html (SPA 路由)
 *  - 跨域资源 (Bilibili 视频等): 不缓存, 网络直连
 */
'use strict';

const CACHE_NAME = 'english-master-v7';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/tts.js',
  './js/progress.js',
  './js/app.js',
  './js/phonics.js',
  './js/sounds.js',
  './js/vocabulary.js',
  './js/grammar.js',
  './js/listening.js',
  './js/speaking.js',
  './js/reading.js',
  './js/media.js',
  './js/writing.js',
  './js/test.js',
  './js/dictionary.js',
  './js/rag.js',
  './js/srs.js',
  './js/student.js',
  './js/errors.js',
  './js/planner.js',
  './js/achievements.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

// 需要离线可用的数据文件 (按需缓存, 不全量预取)
const DATA_FILES = [
  './data/learning_path.json',
  './data/phonics.json',
  './data/phonics_resources.json',
  './data/grammar.json',
  './data/conversations.json',
  './data/knowledge.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // 预缓存应用外壳; 大数据文件(vocabulary/articles等)首次访问时再缓存
      return cache.addAll(APP_SHELL).catch((err) => {
        console.warn('[SW] 预缓存部分失败:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 只处理同源 GET
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // 导航请求: network-first (绕过HTTP缓存拿最新), 回退缓存, 最后回退 index.html
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() =>
          caches.match('./index.html').then((c) => c || caches.match('./'))
        )
    );
    return;
  }

  // 数据文件: cache-first + 后台更新 (后台请求绕过HTTP缓存,保证数据更新)
  if (url.pathname.startsWith('/data/')) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req, { cache: 'no-store' })
          .then((res) => {
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // 其余静态资源: cache-first + 后台更新 (后台请求绕过HTTP缓存,保证更新)
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req, { cache: 'no-store' })
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

// 通知页面可更新
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});