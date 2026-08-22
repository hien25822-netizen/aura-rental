/* Aura Rental — Service Worker v4
   Cho phép:
   - Cache app để dùng offline (khi mất wifi, vẫn mở được)
   - Sync queue sẽ tự gửi khi có mạng lại
   - Anti-skew: chỉ activate version mới khi không còn tab nào đang chạy version cũ
*/

const CACHE = 'aura-v19';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icon-192.svg',
  './icon-512.svg',
  './icon-maskable-512.svg'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  );
  // KHÔNG gọi skipWaiting() — đợi tất cả tab đóng trước
});

self.addEventListener('activate', e => {
  e.waitUntil(
    // Chờ tất cả clients đóng trước khi claim
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      if (clients.length === 0) {
        // Không có tab nào đang mở → claim ngay
        return self.clients.claim();
      }
      // Có tab đang mở → đợi chúng đóng
      // Gửi message cho các tab hiện tại: "version mới sẵn sàng, hãy reload"
      clients.forEach(client => {
        client.postMessage({ type: 'SW_UPDATE_AVAILABLE' });
      });
      // Claim ngay để nhận message (nhưng không force reload)
      return self.clients.claim();
    }).then(() => {
      // Xoá cache cũ
      return caches.keys();
    }).then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
});

self.addEventListener('message', e => {
  // Khi tab nhận SW_UPDATE_AVAILABLE và reload, SW nhận message này
  if (e.data?.type === 'CLIENT_RELOADED') {
    // Tab mới đã reload → tiếp tục bình thường
  }
});

self.addEventListener('fetch', e => {
  // Network-first cho API calls (sync)
  if (e.request.url.includes('script.google.com')) return;

  // Network-first cho HTML & CSS & JS (luôn lấy bản mới nhất)
  const url = new URL(e.request.url);
  const pathname = url.pathname;
  if (pathname.endsWith('.html') || pathname.endsWith('.css') || pathname.endsWith('.js')) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res.ok && e.request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match(e.request).then(c => c || caches.match('./index.html')))
    );
    return;
  }

  // Cache-first cho assets khác (icons, manifest)
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok && e.request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
