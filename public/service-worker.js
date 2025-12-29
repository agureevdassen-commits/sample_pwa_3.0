// Service Worker для Sampling App
// Кэширует статические ресурсы, обеспечивает работу офлайн

const CACHE_NAME = 'sampling-cache-v1';
const RUNTIME_CACHE = 'sampling-runtime-v1';

const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/service-worker.js'
];

// Install: кэшируем статические ресурсы
self.addEventListener('install', (event) => {
    console.log('[Service Worker] Installing...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[Service Worker] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate: очищаем старые кэши
self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Activating...');
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
                            console.log(`[Service Worker] Deleting old cache: ${cacheName}`);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => self.clients.claim())
    );
});

// Fetch: стратегия cache-first для статики, network-first для API
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Не кэшируем POST запросы (API)
    if (request.method === 'POST') {
        event.respondWith(
            fetch(request)
                .catch(() => new Response(
                    JSON.stringify({ error: 'Offline - POST requests not available' }),
                    { status: 503, headers: { 'Content-Type': 'application/json' } }
                ))
        );
        return;
    }

    // Для статических ресурсов - cache-first
    if (STATIC_ASSETS.some(asset => request.url.endsWith(asset))) {
        event.respondWith(
            caches.match(request)
                .then((response) => response || fetch(request))
                .catch(() => caches.match('/index.html'))
        );
        return;
    }

    // Для остального - network-first с резервом на кэш
    event.respondWith(
        fetch(request)
            .then((response) => {
                // Кэшируем успешные GET запросы
                if (response.ok && request.method === 'GET') {
                    const responseClone = response.clone();
                    caches.open(RUNTIME_CACHE)
                        .then((cache) => cache.put(request, responseClone));
                }
                return response;
            })
            .catch(() => {
                // При ошибке сети - ищем в кэше
                return caches.match(request)
                    .then((cached) => {
                        if (cached) return cached;
                        
                        // Если это HTML - возвращаем главную страницу
                        if (request.headers.get('accept').includes('text/html')) {
                            return caches.match('/index.html');
                        }
                        
                        // Для остального - offline response
                        return new Response('Offline - Resource not available', { status: 503 });
                    });
            })
    );
});

// Периодическая синхронизация (Background Sync API)
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-scans') {
        event.waitUntil(
            self.clients.matchAll().then((clients) => {
                clients.forEach((client) => {
                    client.postMessage({ type: 'BACKGROUND_SYNC', tag: 'sync-scans' });
                });
            })
        );
    }
});

// Message listener для коммуникации с клиентом
self.addEventListener('message', (event) => {
    if (event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

console.log('[Service Worker] Loaded');
