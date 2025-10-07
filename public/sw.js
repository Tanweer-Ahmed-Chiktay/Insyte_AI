// Service Worker for background Gmail sync
// Handles push notifications and background sync when app is closed

const CACHE_NAME = 'insyte-gmail-v1'
const SYNC_TAG = 'gmail-sync'
const NOTIFICATION_TAG = 'gmail-notification'

// Install event - cache essential resources
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...')
  
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        '/',
        '/manifest.json',
        // Add other essential resources
      ])
    })
  )
  
  // Take control immediately
  self.skipWaiting()
})

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...')
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName)
            return caches.delete(cacheName)
          }
        })
      )
    })
  )
  
  // Take control of all clients
  self.clients.claim()
})

// Background sync disabled - relying on Pub/Sub for real-time updates
// self.addEventListener('sync', (event) => {
//   console.log('Background sync disabled - using Pub/Sub instead')
// })

// Push event - handle Gmail push notifications
self.addEventListener('push', (event) => {
  console.log('Push notification received:', event.data?.text())
  
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (e) {
    console.error('Error parsing push data:', e)
  }
  
  const options = {
    title: data.title || 'New Gmail Message',
    body: data.body || 'You have a new email',
    icon: '/icon-192x192.png',
    badge: '/badge-72x72.png',
    tag: NOTIFICATION_TAG,
    data: data,
    actions: [
      {
        action: 'open',
        title: 'Open Gmail',
        icon: '/action-open.png'
      },
      {
        action: 'mark-read',
        title: 'Mark as Read',
        icon: '/action-read.png'
      }
    ],
    requireInteraction: false,
    silent: false
  }
  
  event.waitUntil(
    self.registration.showNotification(options.title, options)
  )
})

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event.action)
  
  event.notification.close()
  
  if (event.action === 'open') {
    // Open the app
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        // Check if app is already open
        for (const client of clients) {
          if (client.url.includes(self.location.origin)) {
            return client.focus()
          }
        }
        // Open new window
        return self.clients.openWindow('/')
      })
    )
  } else if (event.action === 'mark-read') {
    // Mark email as read via API
    event.waitUntil(markEmailAsRead(event.notification.data))
  } else {
    // Default action - open app
    event.waitUntil(
      self.clients.openWindow('/')
    )
  }
})

// Message event - handle messages from main thread
self.addEventListener('message', (event) => {
  console.log('Service Worker received message:', event.data)
  
  if (event.data && event.data.type === 'SYNC_GMAIL') {
    event.waitUntil(syncGmail())
  }
})

// Fetch event - handle network requests
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') {
    return
  }
  
  // Handle API requests differently
  if (event.request.url.includes('/api/')) {
    // Network first for API requests
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          // If network fails, try to sync later
          self.registration.sync.register(SYNC_TAG)
          throw new Error('Network unavailable')
        })
    )
    return
  }
  
  // Cache first for static resources
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request)
    })
  )
})

// Gmail sync function
async function syncGmail() {
  // Background sync disabled - relying on Pub/Sub for real-time updates
  console.log('Background sync disabled - using Pub/Sub instead')
  return
}

// Minimal sync disabled - relying on Pub/Sub for real-time updates
async function performMinimalSync() {
  console.log('Minimal sync disabled - using Pub/Sub instead')
  return
}

// Mark email as read
async function markEmailAsRead(emailData) {
  try {
    if (!emailData || !emailData.emailId) {
      console.error('No email ID provided for mark as read')
      return
    }
    
    const response = await fetch(`/api/emails/${emailData.emailId}/mark-read`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    })
    
    if (!response.ok) {
      throw new Error(`Mark as read failed: ${response.status}`)
    }
    
    console.log('Email marked as read:', emailData.emailId)
    
  } catch (error) {
    console.error('Failed to mark email as read:', error)
  }
}

// Periodic sync disabled - relying on Pub/Sub for real-time updates
// self.addEventListener('periodicsync', (event) => {
//   console.log('Periodic sync disabled - using Pub/Sub instead')
// })

console.log('Service Worker loaded')