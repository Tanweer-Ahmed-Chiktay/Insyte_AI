// Real-time Gmail sync service with cross-tab communication
// Provides instant updates across all browser tabs and windows
import { syncCoordinator, requestSync } from './sync-coordinator'

interface SyncEvent {
  type: 'email-updated' | 'email-deleted' | 'email-restored' | 'new-emails' | 'labels-changed'
  category: string
  emailIds?: string[]
  data?: any
  timestamp: number
}

interface RealtimeSyncOptions {
  onSyncEvent?: (event: SyncEvent) => void
  onError?: (error: Error) => void
  aggressiveSync?: boolean // For critical operations like delete/restore
}

class RealtimeSync {
  private channel: BroadcastChannel | null = null
  private syncListener: ((result: any) => void) | null = null
  private isActive = false
  private options: RealtimeSyncOptions
  private lastUserActivity = Date.now()
  private pendingOperations = new Set<string>()
  private isBrowser = typeof window !== 'undefined'
  private activityTimeout: NodeJS.Timeout | null = null

  private readonly USER_ACTIVITY_THRESHOLD = 30000 // 30 seconds

  constructor(options: RealtimeSyncOptions = {}) {
    this.options = options
    if (this.isBrowser) {
      this.initializeBroadcastChannel()
      this.setupActivityTracking()
    }
  }

  private initializeBroadcastChannel() {
    if ('BroadcastChannel' in window) {
      this.channel = new BroadcastChannel('gmail-sync')
      this.channel.addEventListener('message', (event) => {
        const syncEvent: SyncEvent = event.data
        console.log('Received cross-tab sync event:', syncEvent)
        this.options.onSyncEvent?.(syncEvent)
      })
    }
  }

  private setupActivityTracking() {
    const updateActivity = () => {
      this.lastUserActivity = Date.now()
    }

    // Track user activity for adaptive sync frequency
    window.addEventListener('click', updateActivity)
    window.addEventListener('keydown', updateActivity)
    window.addEventListener('scroll', updateActivity)
    window.addEventListener('focus', updateActivity)
  }

  private isUserActive(): boolean {
    return Date.now() - this.lastUserActivity < this.USER_ACTIVITY_THRESHOLD
  }



  public start() {
    if (this.isActive) {
      console.log('Realtime sync already active')
      return
    }

    console.log('Starting realtime Gmail sync...')
    this.isActive = true
    
    // Register with SyncCoordinator
    this.syncListener = (result: any) => {
      if (result.success && result.newEmails > 0) {
        this.broadcastSyncEvent({
          type: 'new-emails',
          category: result.category || 'inbox',
          data: { count: result.newEmails },
          timestamp: Date.now()
        })
      }
      
      if (result.error) {
        this.options.onError?.(result.error)
      }
    }
    
    syncCoordinator.addListener(this.syncListener)
    
    // Automatic sync disabled - relying on Pub/Sub for real-time updates
    // Only manual sync requests will be processed
  }

  public stop() {
    if (!this.isActive) return

    console.log('Stopping realtime Gmail sync...')
    this.isActive = false
    
    if (this.syncListener) {
      syncCoordinator.removeListener(this.syncListener)
      this.syncListener = null
    }
    
    if (this.activityTimeout) {
      clearTimeout(this.activityTimeout)
      this.activityTimeout = null
    }
  }

  private scheduleActivityBasedSync() {
    // Activity-based sync disabled - relying on Pub/Sub for real-time updates
    // This method is now a no-op to prevent automatic API calls
    return
  }

  public broadcastSyncEvent(event: SyncEvent) {
    if (this.channel) {
      this.channel.postMessage(event)
    }
  }

  // Trigger immediate sync for critical operations (manual user actions only)
  public triggerImmediateSync(operation: string) {
    this.pendingOperations.add(operation)
    
    // Only sync for explicit user actions that require immediate feedback
    // Pub/Sub will handle most real-time updates
    console.log(`Manual sync requested for operation: ${operation}`)
    
    // Request minimal sync only for the affected category
    requestSync('inbox', 'high', { 
      background: false, 
      minimal: true,
      force: true 
    })
  }

  // Optimistic UI update helpers
  public notifyEmailDeleted(emailIds: string[], category: string) {
    this.broadcastSyncEvent({
      type: 'email-deleted',
      category,
      emailIds,
      timestamp: Date.now()
    })
    this.triggerImmediateSync('delete')
  }

  public notifyEmailRestored(emailIds: string[], fromCategory: string, toCategory: string) {
    this.broadcastSyncEvent({
      type: 'email-restored',
      category: toCategory,
      emailIds,
      data: { fromCategory },
      timestamp: Date.now()
    })
    this.triggerImmediateSync('restore')
  }

  public notifyLabelsChanged(emailIds: string[], category: string, labels: string[]) {
    this.broadcastSyncEvent({
      type: 'labels-changed',
      category,
      emailIds,
      data: { labels },
      timestamp: Date.now()
    })
    this.triggerImmediateSync('labels')
  }

  public destroy() {
    this.stop()
    if (this.channel) {
      this.channel.close()
      this.channel = null
    }
  }
}

// Global instance
let realtimeSync: RealtimeSync | null = null

export function getRealtimeSync(options?: RealtimeSyncOptions): RealtimeSync {
  if (!realtimeSync) {
    realtimeSync = new RealtimeSync(options)
  }
  return realtimeSync
}

export function startRealtimeSync(options?: RealtimeSyncOptions) {
  const sync = getRealtimeSync(options)
  sync.start()
  return sync
}

export function stopRealtimeSync() {
  if (realtimeSync) {
    realtimeSync.stop()
  }
}

export { RealtimeSync, type SyncEvent, type RealtimeSyncOptions }