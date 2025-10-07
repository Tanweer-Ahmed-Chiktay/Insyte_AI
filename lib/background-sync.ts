// Background Gmail sync service for real-time email updates
import { syncCoordinator, requestSync } from './sync-coordinator'

let isBackgroundSyncActive = false
let syncListener: ((result: any) => void) | null = null
let activityListener: (() => void) | null = null
let userActivityTimeout: NodeJS.Timeout | null = null

const MAX_CONSECUTIVE_ERRORS = 3
let consecutiveErrors = 0

interface BackgroundSyncOptions {
  onSyncComplete?: (result: { category: string; processedCount: number; syncType: string }) => void
  onError?: (error: Error) => void
}

export function startBackgroundSync(options: BackgroundSyncOptions = {}) {
  if (isBackgroundSyncActive) {
    console.log('Background Gmail sync already running')
    return
  }

  console.log('Starting background Gmail sync service...')
  isBackgroundSyncActive = true
  
  // Register sync handler with SyncCoordinator
  syncListener = (result: any) => {
    if (result.success && result.processedCount > 0) {
      console.log(`Background sync processed ${result.processedCount} changes`)
      
      // Trigger cache refresh event
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('gmail-sync-completed', {
          detail: { 
            processedCount: result.processedCount, 
            syncType: result.syncType,
            background: true 
          }
        }))
      }
      
      options.onSyncComplete?.({
        category: result.category || 'all',
        processedCount: result.processedCount,
        syncType: result.syncType
      })
      
      consecutiveErrors = 0
    } else if (result.error) {
      consecutiveErrors++
      console.error(`Background sync error (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`, result.error)
      
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.error('Too many consecutive background sync errors. Stopping service.')
        stopBackgroundSync()
        options.onError?.(result.error)
      }
    }
  }
  
  syncCoordinator.addListener(syncListener)
  
  // Request initial sync
  requestSync('inbox', 'high', { background: true, minimal: true })
  
  // Track user activity for adaptive sync requests
  if (typeof window !== 'undefined') {
    const updateActivity = () => {
      (window as any).lastActivity = Date.now()
      
      // Clear existing timeout
      if (userActivityTimeout) {
        clearTimeout(userActivityTimeout)
      }
      
      // Request high priority sync on activity
      requestSync('inbox', 'high', { background: true, minimal: true })
      
      // Set timeout for lower priority sync when inactive
      userActivityTimeout = setTimeout(() => {
        requestSync('inbox', 'medium', { background: true, minimal: true })
      }, 30000) // 30 seconds of inactivity
    }
    
    activityListener = updateActivity
    window.addEventListener('click', updateActivity)
    window.addEventListener('keydown', updateActivity)
    window.addEventListener('focus', updateActivity)
  }
}

export function stopBackgroundSync() {
  if (syncListener) {
    syncCoordinator.removeListener(syncListener)
    syncListener = null
  }
  
  if (userActivityTimeout) {
    clearTimeout(userActivityTimeout)
    userActivityTimeout = null
  }
  
  // Remove activity listeners
  if (typeof window !== 'undefined' && activityListener) {
    window.removeEventListener('click', activityListener)
    window.removeEventListener('keydown', activityListener)
    window.removeEventListener('focus', activityListener)
    activityListener = null
  }
  
  isBackgroundSyncActive = false
  consecutiveErrors = 0
  console.log('Background Gmail sync service stopped')
}

export function isBackgroundSyncRunning(): boolean {
  return isBackgroundSyncActive
}

export function getBackgroundSyncStatus() {
  return {
    isActive: isBackgroundSyncActive,
    consecutiveErrors,
    syncCoordinator: syncCoordinator.getStats()
  }
}