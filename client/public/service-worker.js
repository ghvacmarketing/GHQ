const CACHE_NAME = 'ghvac-quotes-v1';

// Only cache static assets, not source files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Cache will be populated on first fetch
      return Promise.resolve();
    })
  );
  self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  // Skip caching for dev server HMR and API calls
  if (event.request.url.includes('/@vite') || 
      event.request.url.includes('/api/') ||
      event.request.url.includes('/@fs/') ||
      event.request.url.includes('/__replco') ||
      event.request.url.includes('/src/')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Only cache successful responses
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache if network fails
        return caches.match(event.request);
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});
