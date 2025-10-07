import Pusher from 'pusher'
import PusherClient from 'pusher-js'

// Enable detailed Pusher logging for debugging
if (typeof window !== 'undefined') {
  PusherClient.logToConsole = true;
}

// Server-side Pusher instance
export const pusherServer = new Pusher({
  appId: process.env.PUSHER_APP_ID || '123456',
  key: process.env.PUSHER_KEY || 'abcdef123456',
  secret: process.env.PUSHER_SECRET || 'abcdef123456789',
  cluster: process.env.PUSHER_CLUSTER || 'us2',
  useTLS: true,
})

// Client-side Pusher instance factory (don't instantiate at module level)
export function createPusherClient() {
  const config = getPusherClientConfig();
  console.log('[Pusher] Creating client with config:', { 
    key: config.key ? `${config.key.substring(0, 8)}...` : 'MISSING', 
    cluster: config.cluster || 'MISSING' 
  });
  
  return new PusherClient(config.key, {
    cluster: config.cluster,
    forceTLS: true,
    authEndpoint: '/api/pusher/auth',
    auth: {
      headers: {
        'Content-Type': 'application/json',
      },
    },
  });
}

// Client-side configuration getter for runtime access
export function getPusherClientConfig() {
  // In the browser, environment variables are available via window.__NEXT_DATA__ or need to be passed at build time
  const key = typeof window !== 'undefined' 
    ? (window as any).__NEXT_DATA__?.env?.NEXT_PUBLIC_PUSHER_KEY || process.env.NEXT_PUBLIC_PUSHER_KEY
    : process.env.NEXT_PUBLIC_PUSHER_KEY
  
  const cluster = typeof window !== 'undefined'
    ? (window as any).__NEXT_DATA__?.env?.NEXT_PUBLIC_PUSHER_CLUSTER || process.env.NEXT_PUBLIC_PUSHER_CLUSTER
    : process.env.NEXT_PUBLIC_PUSHER_CLUSTER

  console.log('[Pusher Config] Client config:', { key: key ? 'SET' : 'MISSING', cluster: cluster || 'MISSING' })
  
  return {
    key: key || 'abcdef123456',
    cluster: cluster || 'us2'
  }
}

// Channel names
export const PUSHER_CHANNELS = {
  EMAIL_UPDATES: 'email-updates',
  SYNC_STATUS: 'sync-status',
  USER_SPECIFIC: (userId: string) => `user-${userId}`,
} as const

// Event names
export const PUSHER_EVENTS = {
  EMAIL_NEW: 'email:new',
  EMAIL_UPDATE: 'email:update',
  EMAIL_DELETED: 'email:deleted',
  SYNC_STATUS: 'sync:status',
  GMAIL_PUSH_NOTIFICATION: 'gmail-push-notification',
} as const

// Helper function to get user-specific channel
export function getUserChannel(userId: string): string {
  return PUSHER_CHANNELS.USER_SPECIFIC(userId)
}

// Helper function to trigger events
export async function triggerPusherEvent(
  channel: string,
  event: string,
  data: any,
  socketId?: string
) {
  try {
    await pusherServer.trigger(channel, event, data, {
      socket_id: socketId,
    })
    console.log(`[Pusher] Triggered event ${event} on channel ${channel}`)
  } catch (error) {
    console.error(`[Pusher] Failed to trigger event ${event}:`, error)
    throw error
  }
}

// Helper function to trigger user-specific events
export async function triggerUserEvent(
  userId: string,
  event: string,
  data: any,
  socketId?: string
) {
  const channel = getUserChannel(userId)
  return triggerPusherEvent(channel, event, data, socketId)
}