// Always use the network so cached pages cannot skip the private site's login.
// Keep IndexedDB / localStorage conversations intact; retire only this app's shell caches.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => /^memoria-v\d+$/.test(key)).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});
