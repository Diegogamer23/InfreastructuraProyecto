const SHARE_PATH = '/share-ticket'
const SHARE_CACHE = 'finanzas-claras-shared-ticket-v1'
const SHARE_CACHE_KEY = '/__finanzas-claras-shared-ticket__'
const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'application/pdf'])

self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting()))
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url)
  if (event.request.method === 'POST' && requestUrl.origin === self.location.origin && requestUrl.pathname === SHARE_PATH) {
    event.respondWith(receiveSharedTicket(event.request))
  }
})

async function receiveSharedTicket(request) {
  try {
    const form = await request.formData()
    const shared = form.get('ticket')
    if (!shared || typeof shared.size !== 'number') return redirectWithError('file')
    if (shared.size < 1 || shared.size > MAX_FILE_SIZE) return redirectWithError('size')

    const extensionType = /\.jpe?g$/i.test(shared.name) ? 'image/jpeg' : /\.png$/i.test(shared.name) ? 'image/png' : /\.pdf$/i.test(shared.name) ? 'application/pdf' : ''
    const type = ALLOWED_TYPES.has(shared.type) ? shared.type : extensionType
    if (!type) return redirectWithError('type')

    const cache = await caches.open(SHARE_CACHE)
    const cacheKey = new URL(SHARE_CACHE_KEY, self.location.origin)
    await cache.delete(cacheKey)
    await cache.put(cacheKey, new Response(shared, {
      headers: {
        'Content-Type': type,
        'X-Shared-At': String(Date.now()),
        'X-Shared-Name': encodeURIComponent(shared.name || 'ticket'),
      },
    }))
    return Response.redirect(new URL('/app/movements?sharedTicket=1', self.location.origin), 303)
  } catch {
    return redirectWithError('file')
  }
}

function redirectWithError(reason) {
  const url = new URL('/app/movements', self.location.origin)
  url.searchParams.set('sharedTicket', reason)
  return Response.redirect(url, 303)
}
