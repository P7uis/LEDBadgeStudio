const cacheName = 'badge-studio-v75'
const assets = ['./local-fonts.mjs?v=75', './bitmap-text.mjs?v=75', './', './index.html', './style.css?v=75', './app.mjs?v=75', './protocol.mjs?v=75', './system-fonts.mjs?v=75', './locale.mjs?v=75', './badge-profiles.mjs?v=75', './branding/Rajdhani-Regular.ttf', './branding/Everything3d-Regular.otf', './fonts.mjs?v=75', './font-sources.txt',
  './manifest.webmanifest?v=smiley', './favicon-smiley.png', './icon-smiley-192.png', './icon-smiley-512.png']
self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(assets)).then(() => self.skipWaiting()))
})
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith('badge-studio-') && key !== cacheName)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return
  event.respondWith(caches.open(cacheName).then(async cache => {
    if (request.mode === 'navigate') {
      try { return await fetch(request) }
      catch { return await cache.match('./index.html') }
    }
    return (await cache.match(request)) || fetch(request)
  }))
})
