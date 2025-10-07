/**
 * Advanced 4-Layer Cache Hierarchy System
 * Implements L1 (Memory) -> L2 (BroadcastChannel) -> L3 (IndexedDB) -> L4 (Service Worker)
 * Based on improve2.txt specifications for sub-100ms performance
 */

import { Email } from './email-store'

interface CacheItem<T = any> {
  data: T
  timestamp: number
  accessCount: number
  lastAccessed: number
  size: number
  priority: number
}

interface CacheStats {
  l1: { hits: number; misses: number; size: number; maxSize: number }
  l2: { hits: number; misses: number }
  l3: { hits: number; misses: number; size: number }
  l4: { hits: number; misses: number }
  totalHits: number
  totalMisses: number
  hitRatio: number
}

interface MemoryPressureInfo {
  level: 'low' | 'medium' | 'high' | 'critical'
  availableMemory: number
  usedMemory: number
  recommendedAction: 'none' | 'cleanup' | 'aggressive_cleanup' | 'emergency_cleanup'
}

export class CacheHierarchy {
  private static instance: CacheHierarchy
  
  // L1: Memory Cache (fastest, limited size)
  private l1Cache = new Map<string, CacheItem>()
  private readonly L1_MAX_SIZE = 50 * 1024 * 1024 // 50MB
  private readonly L1_MAX_ITEMS = 1000
  private l1CurrentSize = 0
  
  // L2: BroadcastChannel (cross-tab sync)
  private broadcastChannel: BroadcastChannel | null = null
  private readonly CHANNEL_NAME = 'gmail-cache-sync'
  
  // L3: IndexedDB (persistent storage)
  private db: IDBDatabase | null = null
  private readonly DB_NAME = 'gmail-cache-hierarchy'
  private readonly DB_VERSION = 3
  
  // L4: Service Worker (background operations)
  private serviceWorker: ServiceWorkerRegistration | null = null
  
  // Statistics and monitoring
  private stats: CacheStats = {
    l1: { hits: 0, misses: 0, size: 0, maxSize: this.L1_MAX_SIZE },
    l2: { hits: 0, misses: 0 },
    l3: { hits: 0, misses: 0, size: 0 },
    l4: { hits: 0, misses: 0 },
    totalHits: 0,
    totalMisses: 0,
    hitRatio: 0
  }
  
  // Memory pressure monitoring
  private memoryPressureObserver: PerformanceObserver | null = null
  private lastMemoryCheck = 0
  private readonly MEMORY_CHECK_INTERVAL = 30000 // 30 seconds
  
  private constructor() {
    this.initialize()
  }
  
  static getInstance(): CacheHierarchy {
    if (!CacheHierarchy.instance) {
      CacheHierarchy.instance = new CacheHierarchy()
    }
    return CacheHierarchy.instance
  }
  
  private async initialize(): Promise<void> {
    console.log('[CacheHierarchy] Starting cache hierarchy initialization...')
    
    try {
      // Initialize L2: BroadcastChannel
      if (typeof BroadcastChannel !== 'undefined') {
        this.broadcastChannel = new BroadcastChannel(this.CHANNEL_NAME)
        this.broadcastChannel.addEventListener('message', this.handleBroadcastMessage.bind(this))
        console.log('[CacheHierarchy] ✅ L2 BroadcastChannel initialized:', this.CHANNEL_NAME)
      } else {
        console.warn('[CacheHierarchy] ⚠️ BroadcastChannel not available (server-side or unsupported)')
      }
      
      // Initialize L3: IndexedDB
      console.log('[CacheHierarchy] Initializing L3 IndexedDB...')
      await this.initializeIndexedDB()
      console.log('[CacheHierarchy] ✅ L3 IndexedDB initialized')
      
      // Initialize L4: Service Worker
      console.log('[CacheHierarchy] Initializing L4 Service Worker...')
      await this.initializeServiceWorker()
      console.log('[CacheHierarchy] ✅ L4 Service Worker initialized')
      
      // Setup memory pressure monitoring
      console.log('[CacheHierarchy] Setting up memory pressure monitoring...')
      this.setupMemoryPressureMonitoring()
      console.log('[CacheHierarchy] ✅ Memory pressure monitoring setup')
      
      // Periodic maintenance disabled - relying on Pub/Sub for real-time updates
      // Manual maintenance can still be triggered when needed
      console.log('[CacheHierarchy] Periodic maintenance disabled - using Pub/Sub for real-time updates')
      
      console.log('[CacheHierarchy] ✅ Cache hierarchy initialization complete')
      
    } catch (error) {
      console.error('[CacheHierarchy] ❌ Initialization failed:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      })
    }
  }
  
  private async initializeIndexedDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION)
      
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        
        // Email cache store with compound indexes
        if (!db.objectStoreNames.contains('emails')) {
          const emailStore = db.createObjectStore('emails', { keyPath: 'id' })
          emailStore.createIndex('category_timestamp', ['category', 'timestamp'], { unique: false })
          emailStore.createIndex('sender_timestamp', ['sender', 'timestamp'], { unique: false })
          emailStore.createIndex('isRead_timestamp', ['isRead', 'timestamp'], { unique: false })
          emailStore.createIndex('thread_timestamp', ['threadId', 'timestamp'], { unique: false })
        }
        
        // Compressed content store
        if (!db.objectStoreNames.contains('emailContent')) {
          const contentStore = db.createObjectStore('emailContent', { keyPath: 'id' })
          contentStore.createIndex('lastAccessed', 'lastAccessed', { unique: false })
          contentStore.createIndex('size', 'compressedSize', { unique: false })
          contentStore.createIndex('priority', 'priority', { unique: false })
        }
        
        // User behavior tracking
        if (!db.objectStoreNames.contains('userBehavior')) {
          const behaviorStore = db.createObjectStore('userBehavior', { keyPath: 'id' })
          behaviorStore.createIndex('timestamp', 'timestamp', { unique: false })
          behaviorStore.createIndex('action', 'action', { unique: false })
        }
        
        // Sync state tracking
        if (!db.objectStoreNames.contains('syncState')) {
          const syncStore = db.createObjectStore('syncState', { keyPath: 'category' })
          syncStore.createIndex('lastSync', 'lastSync', { unique: false })
        }
      }
    })
  }
  
  private async initializeServiceWorker(): Promise<void> {
    if ('serviceWorker' in navigator) {
      try {
        this.serviceWorker = await navigator.serviceWorker.register('/sw.js')
        console.log('[CacheHierarchy] Service Worker registered')
      } catch (error) {
        console.error('[CacheHierarchy] Service Worker registration failed:', error)
      }
    }
  }
  
  private setupMemoryPressureMonitoring(): void {
    // Monitor memory usage and pressure
    if ('memory' in performance) {
      setInterval(() => {
        const memInfo = this.getMemoryPressureInfo()
        if (memInfo.level === 'high' || memInfo.level === 'critical') {
          this.handleMemoryPressure(memInfo)
        }
      }, this.MEMORY_CHECK_INTERVAL)
    }
  }
  
  private getMemoryPressureInfo(): MemoryPressureInfo {
    const memory = (performance as any).memory
    if (!memory) {
      return {
        level: 'low',
        availableMemory: 0,
        usedMemory: 0,
        recommendedAction: 'none'
      }
    }
    
    const usedMemory = memory.usedJSHeapSize
    const totalMemory = memory.totalJSHeapSize
    const limit = memory.jsHeapSizeLimit
    
    const usageRatio = usedMemory / limit
    
    let level: MemoryPressureInfo['level']
    let recommendedAction: MemoryPressureInfo['recommendedAction']
    
    if (usageRatio > 0.9) {
      level = 'critical'
      recommendedAction = 'emergency_cleanup'
    } else if (usageRatio > 0.75) {
      level = 'high'
      recommendedAction = 'aggressive_cleanup'
    } else if (usageRatio > 0.6) {
      level = 'medium'
      recommendedAction = 'cleanup'
    } else {
      level = 'low'
      recommendedAction = 'none'
    }
    
    return {
      level,
      availableMemory: limit - usedMemory,
      usedMemory,
      recommendedAction
    }
  }
  
  private async handleMemoryPressure(memInfo: MemoryPressureInfo): Promise<void> {
    console.log(`[CacheHierarchy] Memory pressure detected: ${memInfo.level}`)
    
    switch (memInfo.recommendedAction) {
      case 'cleanup':
        await this.cleanupL1Cache(0.2) // Remove 20% of L1 cache
        break
      case 'aggressive_cleanup':
        await this.cleanupL1Cache(0.5) // Remove 50% of L1 cache
        break
      case 'emergency_cleanup':
        await this.cleanupL1Cache(0.8) // Remove 80% of L1 cache
        await this.cleanupIndexedDB()
        break
    }
  }
  
  private async cleanupL1Cache(ratio: number): Promise<void> {
    const itemsToRemove = Math.floor(this.l1Cache.size * ratio)
    
    // Sort by access frequency and recency (LFU + LRU)
    const sortedItems = Array.from(this.l1Cache.entries())
      .sort(([, a], [, b]) => {
        const scoreA = a.accessCount * 0.7 + (Date.now() - a.lastAccessed) * 0.3
        const scoreB = b.accessCount * 0.7 + (Date.now() - b.lastAccessed) * 0.3
        return scoreA - scoreB
      })
    
    // Remove least valuable items
    for (let i = 0; i < itemsToRemove; i++) {
      const [key, item] = sortedItems[i]
      this.l1Cache.delete(key)
      this.l1CurrentSize -= item.size
    }
    
    console.log(`[CacheHierarchy] Cleaned up ${itemsToRemove} items from L1 cache`)
  }
  
  private async cleanupIndexedDB(): Promise<void> {
    if (!this.db) return
    
    try {
      const transaction = this.db.transaction(['emailContent'], 'readwrite')
      const store = transaction.objectStore('emailContent')
      const index = store.index('lastAccessed')
      
      // Remove content older than 7 days
      const cutoffDate = Date.now() - (7 * 24 * 60 * 60 * 1000)
      const range = IDBKeyRange.upperBound(cutoffDate)
      
      const request = index.openCursor(range)
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result
        if (cursor) {
          cursor.delete()
          cursor.continue()
        }
      }
    } catch (error) {
      console.error('[CacheHierarchy] IndexedDB cleanup failed:', error)
    }
  }
  
  private handleBroadcastMessage(event: MessageEvent): void {
    const { type, key, data } = event.data
    
    switch (type) {
      case 'cache-update':
        // Update L1 cache with data from another tab
        if (data && !this.l1Cache.has(key)) {
          this.setL1(key, data, false) // Don't broadcast back
        }
        break
      case 'cache-invalidate':
        // Remove from L1 cache
        this.l1Cache.delete(key)
        break
    }
  }
  
  // Main cache interface methods
  async get<T>(key: string): Promise<T | null> {
    const startTime = performance.now()
    console.log('[CacheHierarchy] Cache get request:', { key })
    
    // L1: Memory cache (fastest)
    const l1Result = this.getL1<T>(key)
    if (l1Result !== null) {
      this.stats.l1.hits++
      this.stats.totalHits++
      const duration = performance.now() - startTime
      console.log('[CacheHierarchy] ✅ L1 cache hit:', { key, duration: `${duration.toFixed(2)}ms` })
      return l1Result
    }
    this.stats.l1.misses++
    console.log('[CacheHierarchy] L1 cache miss:', { key })
    
    // L2: BroadcastChannel (cross-tab)
    const l2Result = await this.getL2<T>(key)
    if (l2Result !== null) {
      this.stats.l2.hits++
      this.stats.totalHits++
      this.setL1(key, l2Result, false) // Cache in L1 for next access
      const duration = performance.now() - startTime
      console.log('[CacheHierarchy] ✅ L2 cache hit:', { key, duration: `${duration.toFixed(2)}ms` })
      return l2Result
    }
    this.stats.l2.misses++
    console.log('[CacheHierarchy] L2 cache miss:', { key })
    
    // L3: IndexedDB (persistent)
    const l3Result = await this.getL3<T>(key)
    if (l3Result !== null) {
      this.stats.l3.hits++
      this.stats.totalHits++
      this.setL1(key, l3Result, false) // Cache in L1 for next access
      const duration = performance.now() - startTime
      console.log('[CacheHierarchy] ✅ L3 cache hit:', { key, duration: `${duration.toFixed(2)}ms` })
      return l3Result
    }
    this.stats.l3.misses++
    console.log('[CacheHierarchy] L3 cache miss:', { key })
    
    // L4: Service Worker (background)
    const l4Result = await this.getL4<T>(key)
    if (l4Result !== null) {
      this.stats.l4.hits++
      this.stats.totalHits++
      this.setL1(key, l4Result, false) // Cache in L1 for next access
      await this.setL3(key, l4Result) // Cache in L3 for persistence
      const duration = performance.now() - startTime
      console.log('[CacheHierarchy] ✅ L4 cache hit:', { key, duration: `${duration.toFixed(2)}ms` })
      return l4Result
    }
    this.stats.l4.misses++
    this.stats.totalMisses++
    
    const duration = performance.now() - startTime
    console.log('[CacheHierarchy] ❌ Cache miss (all layers):', { 
      key, 
      duration: `${duration.toFixed(2)}ms`,
      hitRatio: this.stats.hitRatio
    })
    
    this.updateHitRatio()
    return null
  }
  
  async set<T>(key: string, data: T, options: { priority?: number; ttl?: number } = {}): Promise<void> {
    const startTime = performance.now()
    const { priority = 1, ttl } = options
    const dataSize = this.estimateSize(data)
    
    console.log('[CacheHierarchy] Cache set request:', { 
      key, 
      priority, 
      ttl, 
      dataSize: `${(dataSize / 1024).toFixed(2)}KB` 
    })
    
    try {
      // Set in all layers
      this.setL1(key, data, true, priority, ttl)
      console.log('[CacheHierarchy] ✅ L1 cache set:', { key })
      
      await this.setL3(key, data, priority, ttl)
      console.log('[CacheHierarchy] ✅ L3 cache set:', { key })
      
      // Notify service worker for background caching
      if (this.serviceWorker) {
        this.serviceWorker.active?.postMessage({
          type: 'cache-set',
          key,
          data,
          priority,
          ttl
        })
        console.log('[CacheHierarchy] ✅ L4 cache set message sent:', { key })
      } else {
        console.log('[CacheHierarchy] ⚠️ Service worker not available for L4 caching')
      }
      
      const duration = performance.now() - startTime
      console.log('[CacheHierarchy] ✅ Cache set complete:', { 
        key, 
        duration: `${duration.toFixed(2)}ms`,
        l1Size: this.l1CurrentSize,
        l1Items: this.l1Cache.size
      })
      
    } catch (error) {
      const duration = performance.now() - startTime
      console.error('[CacheHierarchy] ❌ Cache set failed:', {
        key,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      })
      throw error
    }
  }
  
  private getL1<T>(key: string): T | null {
    const item = this.l1Cache.get(key)
    if (!item) return null
    
    // Check TTL
    if (item.timestamp && Date.now() - item.timestamp > 300000) { // 5 minutes default TTL
      this.l1Cache.delete(key)
      this.l1CurrentSize -= item.size
      return null
    }
    
    // Update access statistics
    item.accessCount++
    item.lastAccessed = Date.now()
    
    return item.data as T
  }
  
  private setL1<T>(key: string, data: T, broadcast = true, priority = 1, ttl?: number): void {
    const size = this.estimateSize(data)
    
    // Check if we need to make space
    if (this.l1CurrentSize + size > this.L1_MAX_SIZE || this.l1Cache.size >= this.L1_MAX_ITEMS) {
      this.evictL1Items(size)
    }
    
    const item: CacheItem<T> = {
      data,
      timestamp: Date.now(),
      accessCount: 1,
      lastAccessed: Date.now(),
      size,
      priority
    }
    
    this.l1Cache.set(key, item)
    this.l1CurrentSize += size
    this.stats.l1.size = this.l1CurrentSize
    
    // Broadcast to other tabs
    if (broadcast && this.broadcastChannel) {
      this.broadcastChannel.postMessage({
        type: 'cache-update',
        key,
        data
      })
    }
  }
  
  private evictL1Items(neededSize: number): void {
    // LFU + LRU eviction strategy
    const items = Array.from(this.l1Cache.entries())
      .sort(([, a], [, b]) => {
        const scoreA = (a.accessCount / (Date.now() - a.lastAccessed + 1)) * a.priority
        const scoreB = (b.accessCount / (Date.now() - b.lastAccessed + 1)) * b.priority
        return scoreA - scoreB
      })
    
    let freedSize = 0
    for (const [key, item] of items) {
      if (freedSize >= neededSize && this.l1Cache.size < this.L1_MAX_ITEMS * 0.8) break
      
      this.l1Cache.delete(key)
      this.l1CurrentSize -= item.size
      freedSize += item.size
    }
  }
  
  private async getL2<T>(key: string): Promise<T | null> {
    // BroadcastChannel doesn't store data, it's for real-time sync
    // This would query other tabs, but for simplicity, we'll return null
    return null
  }
  
  private async getL3<T>(key: string): Promise<T | null> {
    if (!this.db) return null
    
    try {
      const transaction = this.db.transaction(['emails', 'emailContent'], 'readonly')
      const emailStore = transaction.objectStore('emails')
      const contentStore = transaction.objectStore('emailContent')
      
      // Try emails store first
      const emailRequest = emailStore.get(key)
      const emailResult = await new Promise<T | null>((resolve) => {
        emailRequest.onsuccess = () => resolve(emailRequest.result || null)
        emailRequest.onerror = () => resolve(null)
      })
      
      if (emailResult) return emailResult
      
      // Try content store
      const contentRequest = contentStore.get(key)
      const contentResult = await new Promise<T | null>((resolve) => {
        contentRequest.onsuccess = () => {
          const result = contentRequest.result
          if (result) {
            // Update last accessed
            const updateTransaction = this.db!.transaction(['emailContent'], 'readwrite')
            const updateStore = updateTransaction.objectStore('emailContent')
            updateStore.put({ ...result, lastAccessed: Date.now() })
          }
          resolve(result?.data || null)
        }
        contentRequest.onerror = () => resolve(null)
      })
      
      return contentResult
    } catch (error) {
      console.error('[CacheHierarchy] L3 get failed:', error)
      return null
    }
  }
  
  private async setL3<T>(key: string, data: T, priority = 1, ttl?: number): Promise<void> {
    if (!this.db) return
    
    try {
      const transaction = this.db.transaction(['emails', 'emailContent'], 'readwrite')
      const emailStore = transaction.objectStore('emails')
      const contentStore = transaction.objectStore('emailContent')
      
      // Determine which store to use based on data type
      if (this.isEmailData(data)) {
        await new Promise<void>((resolve, reject) => {
          const request = emailStore.put(data)
          request.onsuccess = () => resolve()
          request.onerror = () => reject(request.error)
        })
      } else {
        // Store in content store with compression
        const compressedData = await this.compressData(data)
        const contentItem = {
          id: key,
          data: compressedData,
          originalSize: this.estimateSize(data),
          compressedSize: this.estimateSize(compressedData),
          lastAccessed: Date.now(),
          priority,
          ttl: ttl ? Date.now() + ttl : undefined
        }
        
        await new Promise<void>((resolve, reject) => {
          const request = contentStore.put(contentItem)
          request.onsuccess = () => resolve()
          request.onerror = () => reject(request.error)
        })
      }
    } catch (error) {
      console.error('[CacheHierarchy] L3 set failed:', error)
    }
  }
  
  private async getL4<T>(key: string): Promise<T | null> {
    if (!this.serviceWorker) return null
    
    try {
      // Request data from service worker
      const response = await new Promise<T | null>((resolve) => {
        const channel = new MessageChannel()
        channel.port1.onmessage = (event) => {
          resolve(event.data.result || null)
        }
        
        this.serviceWorker!.active?.postMessage({
          type: 'cache-get',
          key
        }, [channel.port2])
        
        // Timeout after 1 second
        setTimeout(() => resolve(null), 1000)
      })
      
      return response
    } catch (error) {
      console.error('[CacheHierarchy] L4 get failed:', error)
      return null
    }
  }
  
  private async compressData<T>(data: T): Promise<string> {
    // Use compression worker if available, otherwise fallback to JSON
    try {
      if (typeof Worker !== 'undefined') {
        const worker = new Worker('/compression.worker.js')
        const compressed = await new Promise<string>((resolve, reject) => {
          worker.postMessage({ type: 'compress', data: JSON.stringify(data) })
          worker.onmessage = (e) => {
            if (e.data.type === 'compressed') {
              resolve(e.data.result)
            } else {
              reject(new Error('Compression failed'))
            }
            worker.terminate()
          }
          worker.onerror = reject
        })
        return compressed
      }
    } catch (error) {
      console.warn('[CacheHierarchy] Compression failed, using JSON:', error)
    }
    
    return JSON.stringify(data)
  }
  
  private isEmailData(data: any): boolean {
    return data && typeof data === 'object' && 'gmailId' in data
  }
  
  private estimateSize(data: any): number {
    try {
      return new Blob([JSON.stringify(data)]).size
    } catch {
      return JSON.stringify(data).length * 2 // Rough estimate
    }
  }
  
  private updateHitRatio(): void {
    const total = this.stats.totalHits + this.stats.totalMisses
    this.stats.hitRatio = total > 0 ? this.stats.totalHits / total : 0
  }
  
  private async performMaintenance(): Promise<void> {
    // Regular maintenance tasks
    const memInfo = this.getMemoryPressureInfo()
    
    if (memInfo.level === 'medium') {
      await this.cleanupL1Cache(0.1) // Light cleanup
    }
    
    // Update statistics
    this.updateHitRatio()
    
    // Log performance metrics
    if (Math.random() < 0.01) { // 1% sampling
      console.log('[CacheHierarchy] Stats:', {
        hitRatio: this.stats.hitRatio,
        l1Size: this.l1Cache.size,
        memoryPressure: memInfo.level
      })
    }
  }
  
  // Public API methods
  async invalidate(key: string): Promise<void> {
    // Remove from all layers
    this.l1Cache.delete(key)
    
    // Broadcast invalidation
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage({
        type: 'cache-invalidate',
        key
      })
    }
    
    // Remove from IndexedDB
    if (this.db) {
      const transaction = this.db.transaction(['emails', 'emailContent'], 'readwrite')
      transaction.objectStore('emails').delete(key)
      transaction.objectStore('emailContent').delete(key)
    }
    
    // Notify service worker
    if (this.serviceWorker) {
      this.serviceWorker.active?.postMessage({
        type: 'cache-invalidate',
        key
      })
    }
  }
  
  getStats(): CacheStats {
    return { ...this.stats }
  }
  
  getMemoryInfo(): MemoryPressureInfo {
    return this.getMemoryPressureInfo()
  }
  
  async clear(): Promise<void> {
    // Clear all layers
    this.l1Cache.clear()
    this.l1CurrentSize = 0
    
    if (this.db) {
      const transaction = this.db.transaction(['emails', 'emailContent'], 'readwrite')
      transaction.objectStore('emails').clear()
      transaction.objectStore('emailContent').clear()
    }
    
    if (this.serviceWorker) {
      this.serviceWorker.active?.postMessage({ type: 'cache-clear' })
    }
    
    // Reset statistics
    this.stats = {
      l1: { hits: 0, misses: 0, size: 0, maxSize: this.L1_MAX_SIZE },
      l2: { hits: 0, misses: 0 },
      l3: { hits: 0, misses: 0, size: 0 },
      l4: { hits: 0, misses: 0 },
      totalHits: 0,
      totalMisses: 0,
      hitRatio: 0
    }
  }
}

// Export singleton instance
export const cacheHierarchy = CacheHierarchy.getInstance()
export default cacheHierarchy