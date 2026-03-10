const CACHE = ‘memoria-v1’;
const PRECACHE = [
‘./’,
‘https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js’,
‘https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css’
];

self.addEventListener(‘install’, e => {
e.waitUntil(
caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
);
});

self.addEventListener(‘activate’, e => {
e.waitUntil(
caches.keys().then(ks => Promise.all(
ks.filter(k => k !== CACHE).map(k => caches.delete(k))
)).then(() => self.clients.claim())
);
});

self.addEventListener(‘fetch’, e => {
const url = new URL(e.request.url);

// Skip API calls and non-GET
if (e.request.method !== ‘GET’) return;
if (url.pathname.includes(’/functions/’) || url.search.includes(‘action=’)) return;

// Google Fonts: cache-first (fonts rarely change)
if (url.hostname.includes(‘fonts.googleapis.com’) || url.hostname.includes(‘fonts.gstatic.com’)) {
e.respondWith(
caches.match(e.request).then(r => r || fetch(e.request).then(res => {
if (res.ok) {
const clone = res.clone();
caches.open(CACHE).then(c => c.put(e.request, clone));
}
return res;
}))
);
return;
}

// CDN assets: cache-first
if (url.hostname.includes(‘cdnjs.cloudflare.com’)) {
e.respondWith(
caches.match(e.request).then(r => r || fetch(e.request).then(res => {
if (res.ok) {
const clone = res.clone();
caches.open(CACHE).then(c => c.put(e.request, clone));
}
return res;
}))
);
return;
}

// HTML page: stale-while-revalidate
if (e.request.mode === ‘navigate’ || e.request.destination === ‘document’) {
e.respondWith(
caches.match(e.request).then(cached => {
const fetchPromise = fetch(e.request).then(res => {
if (res.ok) {
const clone = res.clone();
caches.open(CACHE).then(c => c.put(e.request, clone));
}
return res;
}).catch(() => cached);
return cached || fetchPromise;
})
);
return;
}
});