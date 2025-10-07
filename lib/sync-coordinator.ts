// Single Sync Coordinator - Replaces all competing sync mechanisms
// Implements rate limiting, deduplication, and coordinated sync strategy

export interface SyncRequest {
  category: string
  priority: 'low' | 'medium' | 'high'
  force?: boolean
  background?: boolean
  minimal?: boolean
}

export interface SyncResult {
  category: string
  success: boolean
  processedCount: number
  syncType: 'incremental' | 'full' | 'cached'
  duration: number
  error?: string
}

class RateLimitManager {
  private requestCounts = new Map<string, number[]>()
  private readonly RATE_LIMIT_WINDOW = 60000 // 1 minute
  private readonly MAX_REQUESTS_PER_MINUTE = 100 // Gmail API limit
  private backoffDelays = new Map<string, number>()

  async execute<T>(key: string, operation: () => Promise<T>): Promise<T> {
    // Check rate limit
    if (this.isRateLimited(key)) {
      const delay = this.getBackoffDelay(key)
      console.log(`Rate limited for ${key}, waiting ${delay}ms`)
      await this.sleep(delay)
    }

    try {
      this.recordRequest(key)
      const result = await operation()
      this.resetBackoff(key)
      return result
    } catch (error: any) {
      if (error.status === 429 || error.code === 429) {
        this.increaseBackoff(key)
        throw new Error(`Rate limited: ${error.message}`)
      }
      throw error
    }
  }

  private isRateLimited(key: string): boolean {
    const requests = this.requestCounts.get(key) || []
    const now = Date.now()
    const recentRequests = requests.filter(time => now - time < this.RATE_LIMIT_WINDOW)
    return recentRequests.length >= this.MAX_REQUESTS_PER_MINUTE
  }

  private recordRequest(key: string): void {
    const requests = this.requestCounts.get(key) || []
    const now = Date.now()
    requests.push(now)
    // Keep only recent requests
    const recentRequests = requests.filter(time => now - time < this.RATE_LIMIT_WINDOW)
    this.requestCounts.set(key, recentRequests)
  }

  private getBackoffDelay(key: string): number {
    return this.backoffDelays.get(key) || 1000
  }

  private increaseBackoff(key: string): void {
    const current = this.backoffDelays.get(key) || 1000
    this.backoffDelays.set(key, Math.min(current * 2, 30000)) // Max 30 seconds
  }

  private resetBackoff(key: string): void {
    this.backoffDelays.delete(key)
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

export class SyncCoordinator {
  private static instance: SyncCoordinator
  private syncQueue = new Map<string, Promise<SyncResult>>()
  private rateLimitManager = new RateLimitManager()
  private lastSyncTimes = new Map<string, number>()
  private syncStatus = new Map<string, 'idle' | 'syncing' | 'error'>()
  private listeners = new Set<(result: SyncResult) => void>()

  // Minimum intervals to prevent thrashing
  private readonly MIN_INTERVALS = {
    high: 5000,    // 5 seconds for high priority
    medium: 15000, // 15 seconds for medium priority
    low: 30000     // 30 seconds for low priority
  }

  static getInstance(): SyncCoordinator {
    if (!this.instance) {
      this.instance = new SyncCoordinator()
    }
    return this.instance
  }

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Request a sync operation with deduplication and rate limiting
   */
  async requestSync(request: SyncRequest): Promise<SyncResult> {
    const key = `sync-${request.category}`
    
    // Check if sync is already in progress
    if (this.syncQueue.has(key)) {
      console.log(`Sync already in progress for ${request.category}, returning existing promise`)
      return this.syncQueue.get(key)!
    }

    // Check minimum interval (prevent thrashing)
    if (!request.force && !this.shouldSync(request)) {
      console.log(`Skipping ${request.category} sync - too recent (${request.priority} priority)`)
      return {
        category: request.category,
        success: true,
        processedCount: 0,
        syncType: 'cached',
        duration: 0
      }
    }

    // Create and queue sync operation
    const syncPromise = this.performSync(request)
    this.syncQueue.set(key, syncPromise)
    
    // Clean up after completion
    syncPromise.finally(() => {
      this.syncQueue.delete(key)
      this.lastSyncTimes.set(request.category, Date.now())
    })

    return syncPromise
  }

  /**
   * Check if a sync should be performed based on timing and priority
   */
  private shouldSync(request: SyncRequest): boolean {
    const lastSync = this.lastSyncTimes.get(request.category) || 0
    const minInterval = this.MIN_INTERVALS[request.priority]
    const timeSinceLastSync = Date.now() - lastSync
    
    return timeSinceLastSync >= minInterval
  }

  /**
   * Perform the actual sync operation with rate limiting
   */
  private async performSync(request: SyncRequest): Promise<SyncResult> {
    const startTime = Date.now()
    this.syncStatus.set(request.category, 'syncing')
    
    try {
      console.log(`Starting ${request.priority} priority sync for ${request.category}`)
      
      // Use rate-limited execution
      const result = await this.rateLimitManager.execute(
        `gmail-${request.category}`,
        () => this.executeCategorySync(request)
      )
      
      const duration = Date.now() - startTime
      const syncResult: SyncResult = {
        category: request.category,
        success: true,
        processedCount: result.processedCount || 0,
        syncType: result.syncType || 'incremental',
        duration
      }
      
      this.syncStatus.set(request.category, 'idle')
      this.notifyListeners(syncResult)
      
      console.log(`Sync completed for ${request.category}: ${syncResult.processedCount} items in ${duration}ms`)
      return syncResult
      
    } catch (error: any) {
      const duration = Date.now() - startTime
      const syncResult: SyncResult = {
        category: request.category,
        success: false,
        processedCount: 0,
        syncType: 'incremental',
        duration,
        error: error.message
      }
      
      this.syncStatus.set(request.category, 'error')
      this.notifyListeners(syncResult)
      
      console.error(`Sync failed for ${request.category}:`, error)
      throw error
    }
  }

  /**
   * Execute the actual Gmail sync API call
   */
  private async executeCategorySync(request: SyncRequest): Promise<any> {
    const response = await fetch('/api/gmail/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        category: request.category,
        force: request.force || false,
        background: request.background || false,
        minimal: request.minimal || false,
        useCache: true
      }),
    })

    if (!response.ok) {
      if (response.status === 429) {
        throw { status: 429, message: 'Rate limited by Gmail API' }
      }
      throw new Error(`Sync API failed: ${response.status} ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * Get current sync status for a category
   */
  getSyncStatus(category: string): 'idle' | 'syncing' | 'error' {
    return this.syncStatus.get(category) || 'idle'
  }

  /**
   * Get last sync time for a category
   */
  getLastSyncTime(category: string): number | null {
    return this.lastSyncTimes.get(category) || null
  }

  /**
   * Check if any sync is currently in progress
   */
  isAnySyncInProgress(): boolean {
    return this.syncQueue.size > 0
  }

  /**
   * Get all categories currently being synced
   */
  getActiveSyncs(): string[] {
    return Array.from(this.syncQueue.keys()).map(key => key.replace('sync-', ''))
  }

  /**
   * Add a listener for sync completion events
   */
  addListener(listener: (result: SyncResult) => void): void {
    this.listeners.add(listener)
  }

  /**
   * Remove a sync completion listener
   */
  removeListener(listener: (result: SyncResult) => void): void {
    this.listeners.delete(listener)
  }

  /**
   * Notify all listeners of sync completion
   */
  private notifyListeners(result: SyncResult): void {
    this.listeners.forEach(listener => {
      try {
        listener(result)
      } catch (error) {
        console.error('Error in sync listener:', error)
      }
    })
  }

  /**
   * Force stop all active syncs (emergency stop)
   */
  stopAllSyncs(): void {
    console.log('Emergency stop: cancelling all active syncs')
    this.syncQueue.clear()
    this.syncStatus.clear()
  }

  /**
   * Get comprehensive sync statistics
   */
  getStats() {
    return {
      activeSyncs: this.getActiveSyncs(),
      queueSize: this.syncQueue.size,
      lastSyncTimes: Object.fromEntries(this.lastSyncTimes),
      syncStatuses: Object.fromEntries(this.syncStatus),
      isAnyActive: this.isAnySyncInProgress()
    }
  }
}

// Export singleton instance
export const syncCoordinator = SyncCoordinator.getInstance()

// Convenience functions
export const requestSync = (category: string, priority: 'low' | 'medium' | 'high' = 'medium', options: Partial<SyncRequest> = {}) => {
  return syncCoordinator.requestSync({
    category,
    priority,
    ...options
  })
}

export const getSyncStatus = (category: string) => syncCoordinator.getSyncStatus(category)
export const isAnySyncActive = () => syncCoordinator.isAnySyncInProgress()
export const getSyncStats = () => syncCoordinator.getStats()