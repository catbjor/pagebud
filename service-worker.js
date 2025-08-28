self.addEventListener('install', (e) => {
    self.skipWaiting();
});
self.addEventListener('activate', (e) => {
    clients.claim();
});
self.addEventListener('push', (event) => {
    const data = event.data ? event.data.json() : { title: 'PageBud', body: 'New notification' };
    event.waitUntil(self.registration.showNotification(data.title || 'PageBud', {
        body: data.body || '',
        icon: data.icon || 'icons/book-192.png',
    }));
});