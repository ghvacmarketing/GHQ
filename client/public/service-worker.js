// v2: bumping CACHE_NAME purges every device's old static cache on activate —
// the v1 cache could hand back a stale index.html whose chunk hashes were
// purged by a deploy, reload-looping the app dead.
const CACHE_NAME = 'ghvac-static-v2';
const API_CACHE_NAME = 'ghvac-api-cache-v1';
const API_CACHE_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.resolve();
    })
  );
  self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Skip caching for dev server HMR and other dev endpoints
  if (url.pathname.includes('/@vite') ||
      url.pathname.includes('/@fs/') ||
      url.pathname.includes('/__replco') ||
      url.pathname.includes('/src/')) {
    return;
  }

  // Handle work orders API with network-first, cache-fallback strategy
  if (url.pathname.startsWith('/api/crm/work-orders')) {
    event.respondWith(handleWorkOrdersAPI(event.request));
    return;
  }

  // Skip other API calls (except work orders handled above)
  if (url.pathname.includes('/api/')) {
    return;
  }

  // Hashed build assets are immutable — cache-first. A cached shell's chunks
  // stay servable offline even after later deploys purge them server-side.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(event.request).then((hit) => {
        if (hit) return hit;
        return fetch(event.request).then((response) => {
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // Everything else (the shell, manifest, icons): network-first so a deploy
  // is picked up on the very next launch; cache only as an offline fallback.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});

async function handleWorkOrdersAPI(request) {
  const cacheKey = createCacheKey(request);
  
  try {
    // Try network first
    const response = await fetch(request);
    
    if (response.ok) {
      // Clone response and cache it with timestamp
      const responseClone = response.clone();
      const cache = await caches.open(API_CACHE_NAME);
      
      // Create a new response with cache timestamp header
      const headers = new Headers(responseClone.headers);
      headers.set('X-Cached-At', Date.now().toString());
      
      const body = await responseClone.blob();
      const cachedResponse = new Response(body, {
        status: responseClone.status,
        statusText: responseClone.statusText,
        headers: headers
      });
      
      await cache.put(cacheKey, cachedResponse);
    }
    
    return response;
  } catch (error) {
    // Network failed, try cache
    const cache = await caches.open(API_CACHE_NAME);
    const cachedResponse = await cache.match(cacheKey);
    
    if (cachedResponse) {
      // Check if cache is still valid (within 24 hours)
      const cachedAt = cachedResponse.headers.get('X-Cached-At');
      if (cachedAt) {
        const age = Date.now() - parseInt(cachedAt, 10);
        if (age > API_CACHE_MAX_AGE) {
          console.log('Returning stale cached data for work orders');
        }
      }
      
      // Add header to indicate this is from cache
      const headers = new Headers(cachedResponse.headers);
      headers.set('X-From-Cache', 'true');
      
      const body = await cachedResponse.blob();
      return new Response(body, {
        status: cachedResponse.status,
        statusText: cachedResponse.statusText,
        headers: headers
      });
    }
    
    // No cache available, return error response
    return new Response(JSON.stringify({ error: 'Offline and no cached data available' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

function createCacheKey(request) {
  const url = new URL(request.url);
  return new Request(url.pathname + url.search, { method: 'GET' });
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
              return caches.delete(cacheName);
            }
          })
        );
      }),
      cleanupStaleAPICache()
    ])
  );
  self.clients.claim();
});

async function cleanupStaleAPICache() {
  try {
    const cache = await caches.open(API_CACHE_NAME);
    const requests = await cache.keys();
    
    for (const request of requests) {
      const response = await cache.match(request);
      if (response) {
        const cachedAt = response.headers.get('X-Cached-At');
        if (cachedAt) {
          const age = Date.now() - parseInt(cachedAt, 10);
          if (age > API_CACHE_MAX_AGE) {
            await cache.delete(request);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error cleaning up stale API cache:', error);
  }
}

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
  
  if (event.data === 'cleanupCache') {
    cleanupStaleAPICache();
  }
});
