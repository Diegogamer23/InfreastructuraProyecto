const SHARE_CACHE = 'finanzas-claras-shared-ticket-v1'
const SHARE_CACHE_KEY = '/__finanzas-claras-shared-ticket__'
const MAX_AGE_MS = 30 * 60 * 1000
const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'application/pdf'])

export async function consumeSharedReceipt() {
  if (!('caches' in window)) return null
  const cache = await caches.open(SHARE_CACHE)
  const cacheKey = new URL(SHARE_CACHE_KEY, window.location.origin)
  const response = await cache.match(cacheKey)
  if (!response) return null
  await cache.delete(cacheKey)

  const sharedAt = Number(response.headers.get('X-Shared-At'))
  const fileType = response.headers.get('Content-Type') || ''
  const fileName = decodeURIComponent(response.headers.get('X-Shared-Name') || 'ticket')
  const file = await response.blob()
  if (!Number.isFinite(sharedAt) || Date.now() - sharedAt > MAX_AGE_MS) throw new Error('El ticket compartido ya venció. Vuelve a compartirlo.')
  if (!ALLOWED_TYPES.has(fileType)) throw new Error('Solo se aceptan fotos JPG o PNG y PDF de una página.')
  if (file.size < 1 || file.size > MAX_FILE_SIZE) throw new Error('El archivo debe pesar 10 MB o menos.')
  return new File([file], fileName, { type: fileType })
}
