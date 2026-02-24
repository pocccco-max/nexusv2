/* ══════════════════════════════════════════════════════════
   SERVICE WORKER - PWA OFFLINE SUPPORT
   ══════════════════════════════════════════════════════════ */

const CACHE_NAME = 'nexus-ai-v1.0.0';
const urlsToCache = [
  '/',
  '/index.html',
  '/styles/main.css',
  '/styles/sidebar.css',
  '/styles/themes.css',
  '/styles/hourglass.css',
  '/styles/stickies.css',
  '/styles/chatbot.css',
  '/js/storage.js',
  '/js/background.js',
  '/js/hourglass.js',
  '/js/stickies.js',
  '/js/chatbot.js',
  '/js/settings.js',
  '/js/app.js',
  '/manifest.json',
  '/favicon.svg'
];

// Install event - cache assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache.map(url => new Request(url, { cache: 'reload' })));
      })
      .catch((error) => {
        console.error('Cache installation failed:', error);
      })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Skip cross-origin requests and API calls
  if (!event.request.url.startsWith(self.location.origin) || 
      event.request.url.includes('/api/') ||
      event.request.url.includes('groq.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - return response
        if (response) {
          return response;
        }

        // Clone the request
        const fetchRequest = event.request.clone();

        return fetch(fetchRequest).then((response) => {
          // Check if valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return response;
        }).catch(() => {
          // Offline fallback
          return caches.match('/index.html');
        });
      })
  );
});

// Background sync for future enhancements
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-data') {
    event.waitUntil(syncData());
  }
});

async function syncData() {
  // Placeholder for future background sync functionality
  console.log('Background sync triggered');
}

// Push notifications (for future enhancements)
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : 'New notification',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-96.png',
    vibrate: [200, 100, 200],
    tag: 'nexus-notification',
    requireInteraction: false
  };

  event.waitUntil(
    self.registration.showNotification('Nexus AI', options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  event.waitUntil(
    clients.openWindow('/')
  );
});
