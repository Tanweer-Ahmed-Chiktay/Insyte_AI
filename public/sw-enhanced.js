/**
 * Enhanced Service Worker for InSyte2
 * Implements advanced caching strategies and push notification handling
 * Based on improve2.txt specifications
 */

// Cache names and versions
const CACHE_VERSION = 'v1.2.0'
const STATIC_CACHE = `insyte-static-${CACHE_VERSION}`
const DYNAMIC_CACHE = `insyte-dynamic-${CACHE_VERSION}`
const EMAIL_CACHE = `insyte-emails-${CACHE_VERSION}`
const API_CACHE = `insyte-api-${CACHE_VERSION}`
const IMAGE_CACHE = `insyte-images-${CACHE_VERSION}`

// Cache configurations
const CACHE_CONFIG = {
  static: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    maxEntries: 100
  },
  dynamic: {
    maxAge: 24 * 60 * 60 * 1000, // 1 day
    maxEntries: 200
  },
  emails: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    maxEntries: 10000
  },
  api: {
    maxAge: 5 * 60 * 1000, // 5 minutes
    maxEntries: 500
  },
  images: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    maxEntries: 1000
  }
}

// Network conditions tracking
let networkCondition = 'good' // good, slow, offline
let lastNetworkCheck = 0
const NETWORK_CHECK_INTERVAL = 30000 // 30 seconds

// Performance metrics
const metrics = {
  cacheHits: 0,
  cacheMisses: 0,
  networkRequests: 0,
  networkFailures: 0,
  averageResponseTime: 0,
  totalRequests: 0
}

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing enhanced service worker')
  
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then(async (cache) => {
        const assetsToCache = ['/'];
        
        // Try to cache each asset individually to avoid failing the entire batch
        for (const asset of assetsToCache) {
          try {
            await cache.add(asset);
          } catch (error) {
            console.warn(`[SW] Failed to cache asset ${asset}:`, error.message);
          }
        }
        
        // Try to cache favicon separately since it might not exist
        try {
          await cache.add('/favicon.ico');
        } catch (error) {
          console.warn('[SW] Favicon not found, skipping cache');
        }
      }),
      // Initialize other caches
      caches.open(DYNAMIC_CACHE),
      caches.open(EMAIL_CACHE),
      caches.open(API_CACHE),
      caches.open(IMAGE_CACHE)
    ]).then(() => {
      console.log('[SW] Static assets cached')
      return self.skipWaiting()
    })
  )
})

// Activate event - cleanup old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating enhanced service worker')
  
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (!cacheName.includes(CACHE_VERSION)) {
              console.log('[SW] Deleting old cache:', cacheName)
              return caches.delete(cacheName)
            }
          })
        )
      }),
      // Take control of all clients
      self.clients.claim()
    ])
  )
})

// Fetch event - implement caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  
  // Skip non-GET requests and chrome-extension requests
  if (request.method !== 'GET' || url.protocol === 'chrome-extension:') {
    return
  }
  
  // Route requests to appropriate handlers
  if (isStaticAsset(url)) {
    event.respondWith(handleStaticAsset(request))
  } else if (isEmailRequest(url)) {
    event.respondWith(handleEmailRequest(request))
  } else if (isApiRequest(url)) {
    event.respondWith(handleApiRequest(request))
  } else if (isImageRequest(url)) {
    event.respondWith(handleImageRequest(request))
  } else {
    event.respondWith(handleDynamicRequest(request))
  }
})

// Push notification handler
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received')
  
  let notificationData = {}
  
  if (event.data) {
    try {
      notificationData = event.data.json()
    } catch (error) {
      console.error('[SW] Failed to parse push data:', error)
      notificationData = { title: 'New Email', body: 'You have a new email' }
    }
  }
  
  const options = {
    body: notificationData.body || 'You have a new email',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: 'email-notification',
    data: notificationData,
    actions: [
      {
        action: 'view',
        title: 'View Email'
      },
      {
        action: 'dismiss',
        title: 'Dismiss'
      }
    ],
    requireInteraction: true
  }
  
  event.waitUntil(
    self.registration.showNotification(
      notificationData.title || 'New Email',
      options
    )
  )
})

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action)
  
  event.notification.close()
  
  if (event.action === 'view') {
    // Open the app and navigate to the email
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then((clientList) => {
        // If app is already open, focus it
        for (const client of clientList) {
          if (client.url.includes(self.location.origin)) {
            client.focus()
            // Send message to navigate to email
            client.postMessage({
              type: 'navigate-to-email',
              emailId: event.notification.data?.emailId
            })
            return
          }
        }
        
        // Open new window
        return clients.openWindow('/')
      })
    )
  }
})

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync triggered:', event.tag)
  
  if (event.tag === 'email-sync') {
    event.waitUntil(syncEmails())
  } else if (event.tag === 'send-email') {
    event.waitUntil(sendPendingEmails())
  }
})

// Message handler for communication with main thread
self.addEventListener('message', (event) => {
  const { type, data } = event.data
  
  switch (type) {
    case 'cache-email':
      handleCacheEmail(data)
      break
    case 'invalidate-cache':
      handleInvalidateCache(data)
      break
    case 'get-cache-stats':
      handleGetCacheStats(event)
      break
    case 'update-network-condition':
      networkCondition = data.condition
      break
    case 'gmail-push-notification':
      // Forward to main thread for processing
      broadcastToClients({
        type: 'gmail-push-notification',
        notification: data
      })
      break
    default:
      console.warn('[SW] Unknown message type:', type)
  }
})

// Request type detection functions
function isStaticAsset(url) {
  return url.pathname.match(/\.(js|css|html|ico|png|jpg|jpeg|gif|svg|woff|woff2|ttf)$/)
}

function isEmailRequest(url) {
  return url.pathname.includes('/api/emails') || url.pathname.includes('/gmail/v1/users/me/messages')
}

function isApiRequest(url) {
  return url.pathname.startsWith('/api/') || url.hostname === 'gmail.googleapis.com'
}

function isImageRequest(url) {
  return url.pathname.match(/\.(png|jpg|jpeg|gif|svg|webp)$/)
}

// Cache strategy handlers
async function handleStaticAsset(request) {
  const startTime = Date.now()
  
  try {
    // Cache first strategy for static assets
    const cachedResponse = await caches.match(request, { cacheName: STATIC_CACHE })
    
    if (cachedResponse) {
      updateMetrics('hit', Date.now() - startTime)
      return cachedResponse
    }
    
    // Fetch and cache
    const response = await fetch(request)
    
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE)
      cache.put(request, response.clone())
    }
    
    updateMetrics('miss', Date.now() - startTime)
    return response
    
  } catch (error) {
    console.error('[SW] Static asset fetch failed:', error)
    updateMetrics('error', Date.now() - startTime)
    
    // Return cached version if available
    const cachedResponse = await caches.match(request)
    if (cachedResponse) {
      return cachedResponse
    }
    
    // Return offline page or error response
    return new Response('Asset not available offline', { status: 503 })
  }
}

async function handleEmailRequest(request) {
  const startTime = Date.now()
  const url = new URL(request.url)
  
  try {
    // Network first strategy for emails with intelligent caching
    if (networkCondition === 'offline') {
      const cachedResponse = await caches.match(request, { cacheName: EMAIL_CACHE })
      if (cachedResponse) {
        updateMetrics('hit', Date.now() - startTime)
        return cachedResponse
      }
    }
    
    // Try network first
    const response = await fetchWithTimeout(request, getTimeoutForCondition())
    
    if (response.ok) {
      // Cache successful responses
      const cache = await caches.open(EMAIL_CACHE)
      
      // Add metadata for cache management
      const responseClone = response.clone()
      const responseWithMetadata = new Response(responseClone.body, {
        status: responseClone.status,
        statusText: responseClone.statusText,
        headers: {
          ...responseClone.headers,
          'sw-cached-at': Date.now().toString(),
          'sw-cache-type': 'email'
        }
      })
      
      cache.put(request, responseWithMetadata)
      updateMetrics('miss', Date.now() - startTime)
      return response
    }
    
    throw new Error(`Network response not ok: ${response.status}`)
    
  } catch (error) {
    console.warn('[SW] Email fetch failed, trying cache:', error.message)
    
    // Fallback to cache
    const cachedResponse = await caches.match(request, { cacheName: EMAIL_CACHE })
    
    if (cachedResponse) {
      updateMetrics('hit', Date.now() - startTime)
      return cachedResponse
    }
    
    updateMetrics('error', Date.now() - startTime)
    return new Response(
      JSON.stringify({ error: 'Email not available offline' }),
      { 
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
}

async function handleApiRequest(request) {
  const startTime = Date.now()
  
  try {
    // Network first with short cache for API requests
    const response = await fetchWithTimeout(request, getTimeoutForCondition())
    
    if (response.ok) {
      // Cache GET requests only
      if (request.method === 'GET') {
        const cache = await caches.open(API_CACHE)
        
        // Add short TTL for API responses
        try {
          const responseClone = response.clone()
          const responseWithMetadata = new Response(responseClone.body, {
            status: responseClone.status,
            statusText: responseClone.statusText,
            headers: {
              ...responseClone.headers,
              'sw-cached-at': Date.now().toString(),
              'sw-cache-ttl': CACHE_CONFIG.api.maxAge.toString()
            }
          })
          
          await cache.put(request, responseWithMetadata)
        } catch (cacheError) {
          console.warn('[SW] Failed to cache API response:', cacheError.message)
          // Continue without caching if cache operation fails
        }
      }
      
      updateMetrics('miss', Date.now() - startTime)
      return response.clone()
    }
    
    throw new Error(`API response not ok: ${response.status}`)
    
  } catch (error) {
    console.warn('[SW] API fetch failed:', error.message)
    
    // Try cache for GET requests
    if (request.method === 'GET') {
      const cachedResponse = await caches.match(request, { cacheName: API_CACHE })
      
      if (cachedResponse && !isCacheExpired(cachedResponse, CACHE_CONFIG.api.maxAge)) {
        updateMetrics('hit', Date.now() - startTime)
        return cachedResponse
      }
    }
    
    updateMetrics('error', Date.now() - startTime)
    return new Response(
      JSON.stringify({ error: 'API not available offline' }),
      { 
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
}

async function handleImageRequest(request) {
  const startTime = Date.now()
  
  try {
    // Cache first for images
    const cachedResponse = await caches.match(request, { cacheName: IMAGE_CACHE })
    
    if (cachedResponse && !isCacheExpired(cachedResponse, CACHE_CONFIG.images.maxAge)) {
      updateMetrics('hit', Date.now() - startTime)
      return cachedResponse
    }
    
    // Fetch and cache
    const response = await fetchWithTimeout(request, getTimeoutForCondition())
    
    if (response.ok) {
      const cache = await caches.open(IMAGE_CACHE)
      cache.put(request, response.clone())
    }
    
    updateMetrics('miss', Date.now() - startTime)
    return response
    
  } catch (error) {
    console.warn('[SW] Image fetch failed:', error.message)
    
    // Return cached version if available
    const cachedResponse = await caches.match(request, { cacheName: IMAGE_CACHE })
    if (cachedResponse) {
      updateMetrics('hit', Date.now() - startTime)
      return cachedResponse
    }
    
    updateMetrics('error', Date.now() - startTime)
    return new Response('Image not available offline', { status: 503 })
  }
}

async function handleDynamicRequest(request) {
  const startTime = Date.now()
  
  try {
    // Network first for dynamic content
    const response = await fetchWithTimeout(request, getTimeoutForCondition())
    
    if (response.ok) {
      // Cache successful responses
      const cache = await caches.open(DYNAMIC_CACHE)
      cache.put(request, response.clone())
    }
    
    updateMetrics('miss', Date.now() - startTime)
    return response
    
  } catch (error) {
    console.warn('[SW] Dynamic fetch failed:', error.message)
    
    // Fallback to cache
    const cachedResponse = await caches.match(request, { cacheName: DYNAMIC_CACHE })
    
    if (cachedResponse) {
      updateMetrics('hit', Date.now() - startTime)
      return cachedResponse
    }
    
    updateMetrics('error', Date.now() - startTime)
    return new Response('Content not available offline', { status: 503 })
  }
}

// Utility functions
async function fetchWithTimeout(request, timeout) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)
  
  try {
    const response = await fetch(request, {
      signal: controller.signal
    })
    clearTimeout(timeoutId)
    return response
  } catch (error) {
    clearTimeout(timeoutId)
    throw error
  }
}

function getTimeoutForCondition() {
  switch (networkCondition) {
    case 'slow': return 10000 // 10 seconds
    case 'good': return 5000  // 5 seconds
    default: return 3000      // 3 seconds
  }
}

function isCacheExpired(response, maxAge) {
  const cachedAt = response.headers.get('sw-cached-at')
  if (!cachedAt) return true
  
  return Date.now() - parseInt(cachedAt) > maxAge
}

function updateMetrics(type, responseTime) {
  metrics.totalRequests++
  
  switch (type) {
    case 'hit':
      metrics.cacheHits++
      break
    case 'miss':
      metrics.cacheMisses++
      metrics.networkRequests++
      break
    case 'error':
      metrics.networkFailures++
      break
  }
  
  // Update average response time
  metrics.averageResponseTime = 
    (metrics.averageResponseTime * (metrics.totalRequests - 1) + responseTime) / metrics.totalRequests
}

// Cache management functions
async function handleCacheEmail(data) {
  try {
    const { key, email, options = {} } = data
    const cache = await caches.open(EMAIL_CACHE)
    
    const response = new Response(JSON.stringify(email), {
      headers: {
        'Content-Type': 'application/json',
        'sw-cached-at': Date.now().toString(),
        'sw-cache-priority': (options.priority || 0.5).toString()
      }
    })
    
    await cache.put(new Request(key), response)
    console.log('[SW] Cached email:', key)
    
  } catch (error) {
    console.error('[SW] Failed to cache email:', error)
  }
}

async function handleInvalidateCache(data) {
  try {
    const { pattern, cacheType } = data
    
    const cacheNames = cacheType ? [getCacheNameForType(cacheType)] : 
      [STATIC_CACHE, DYNAMIC_CACHE, EMAIL_CACHE, API_CACHE, IMAGE_CACHE]
    
    for (const cacheName of cacheNames) {
      const cache = await caches.open(cacheName)
      const keys = await cache.keys()
      
      for (const request of keys) {
        if (!pattern || request.url.includes(pattern)) {
          await cache.delete(request)
        }
      }
    }
    
    console.log('[SW] Invalidated cache:', pattern || 'all')
    
  } catch (error) {
    console.error('[SW] Failed to invalidate cache:', error)
  }
}

async function handleGetCacheStats(event) {
  try {
    const stats = {
      metrics: { ...metrics },
      caches: {}
    }
    
    const cacheNames = [STATIC_CACHE, DYNAMIC_CACHE, EMAIL_CACHE, API_CACHE, IMAGE_CACHE]
    
    for (const cacheName of cacheNames) {
      const cache = await caches.open(cacheName)
      const keys = await cache.keys()
      stats.caches[cacheName] = {
        entries: keys.length,
        size: await getCacheSize(cache, keys)
      }
    }
    
    event.ports[0].postMessage(stats)
    
  } catch (error) {
    console.error('[SW] Failed to get cache stats:', error)
    event.ports[0].postMessage({ error: error.message })
  }
}

async function getCacheSize(cache, keys) {
  let totalSize = 0
  
  for (const request of keys.slice(0, 10)) { // Sample first 10 for performance
    try {
      const response = await cache.match(request)
      if (response) {
        const blob = await response.blob()
        totalSize += blob.size
      }
    } catch (error) {
      // Ignore errors for individual entries
    }
  }
  
  return Math.round(totalSize * keys.length / Math.min(keys.length, 10)) // Estimate total
}

function getCacheNameForType(type) {
  switch (type) {
    case 'static': return STATIC_CACHE
    case 'dynamic': return DYNAMIC_CACHE
    case 'email': return EMAIL_CACHE
    case 'api': return API_CACHE
    case 'image': return IMAGE_CACHE
    default: return DYNAMIC_CACHE
  }
}

// Background sync functions
async function syncEmails() {
  try {
    console.log('[SW] Starting background email sync')
    
    // Notify main thread to perform sync
    await broadcastToClients({
      type: 'background-sync',
      action: 'sync-emails'
    })
    
  } catch (error) {
    console.error('[SW] Background email sync failed:', error)
    throw error // This will cause the sync to be retried
  }
}

async function sendPendingEmails() {
  try {
    console.log('[SW] Sending pending emails')
    
    // Notify main thread to send pending emails
    await broadcastToClients({
      type: 'background-sync',
      action: 'send-pending-emails'
    })
    
  } catch (error) {
    console.error('[SW] Failed to send pending emails:', error)
    throw error
  }
}

// Communication helpers
async function broadcastToClients(message) {
  const clients = await self.clients.matchAll()
  
  for (const client of clients) {
    client.postMessage(message)
  }
}

// Periodic cleanup
setInterval(async () => {
  try {
    await cleanupExpiredCaches()
  } catch (error) {
    console.error('[SW] Cache cleanup failed:', error)
  }
}, 60 * 60 * 1000) // Every hour

async function cleanupExpiredCaches() {
  const cacheConfigs = [
    { name: EMAIL_CACHE, maxAge: CACHE_CONFIG.emails.maxAge, maxEntries: CACHE_CONFIG.emails.maxEntries },
    { name: API_CACHE, maxAge: CACHE_CONFIG.api.maxAge, maxEntries: CACHE_CONFIG.api.maxEntries },
    { name: IMAGE_CACHE, maxAge: CACHE_CONFIG.images.maxAge, maxEntries: CACHE_CONFIG.images.maxEntries },
    { name: DYNAMIC_CACHE, maxAge: CACHE_CONFIG.dynamic.maxAge, maxEntries: CACHE_CONFIG.dynamic.maxEntries }
  ]
  
  for (const config of cacheConfigs) {
    try {
      const cache = await caches.open(config.name)
      const keys = await cache.keys()
      
      // Remove expired entries
      for (const request of keys) {
        const response = await cache.match(request)
        if (response && isCacheExpired(response, config.maxAge)) {
          await cache.delete(request)
        }
      }
      
      // Enforce max entries (remove oldest)
      const remainingKeys = await cache.keys()
      if (remainingKeys.length > config.maxEntries) {
        const keysToRemove = remainingKeys.slice(0, remainingKeys.length - config.maxEntries)
        for (const request of keysToRemove) {
          await cache.delete(request)
        }
      }
      
    } catch (error) {
      console.error(`[SW] Failed to cleanup cache ${config.name}:`, error)
    }
  }
}

console.log('[SW] Enhanced service worker loaded')