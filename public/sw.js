/* Service Worker: nhan thong bao day (Web Push) khi nguoi dung dang offline / da dong app */
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { /* bo qua */ }
  const title = d.title || 'Tin nhắn mới';
  const opts = {
    body: d.body || '',
    icon: '/stickers/meo-01.png',
    badge: '/stickers/meo-01.png',
    tag: d.tag || 'msg',
    renotify: true,
    data: { conv: d.conv || null },
  };
  event.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const conv = event.notification.data && event.notification.data.conv;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if ('focus' in w) {
        await w.focus();
        if (conv) w.postMessage({ type: 'open-conv', conv });
        return;
      }
    }
    await self.clients.openWindow(conv ? '/?conv=' + encodeURIComponent(conv) : '/');
  })());
});
