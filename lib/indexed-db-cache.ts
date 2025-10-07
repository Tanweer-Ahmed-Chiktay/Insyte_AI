// IndexedDB Cache Implementation - Fast local storage for emails and metadata
// Provides offline support and instant loading from cache

export interface CachedEmail {
  id: string
  threadId: string
  category: string
  subject: string
  from: string
  to: string[]
  date: string
  snippet: string
  isRead: boolean
  isStarred: boolean
  hasAttachment: boolean
  labels: string[]
  gmailId: string
  timestamp: number
  cachedAt: number
  lastAccessed: number
}

export interface CachedContent {
  id: string
  content: any
  etag?: string
  cachedAt: number
  lastAccessed: number
  size: number
}

export interface CacheMetadata {
  category: string
  lastFetched: number
  emailCount: number
  historyId?: string
  nextPageToken?: string
  isValid: boolean
}

export class EmailCache {
  private db: IDBDatabase | null = null
  private readonly DB_NAME = 'gmail-sync-cache'
  private readonly DB_VERSION = 2
  private readonly MAX_CACHE_SIZE = 100 * 1024 * 1024 // 100MB
  private readonly CACHE_TTL = 5 * 60 * 1000 // 5 minutes
  private readonly CONTENT_TTL = 30 * 60 * 1000 // 30 minutes for content
  private readonly MAX_CACHED_EMAILS = 5000
  private readonly MAX_CACHED_CONTENT = 1000

  /**
   * Initialize the IndexedDB database
   */
  async initialize(): Promise<void> {
    if (this.db) return

    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION)
      
      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error)
        reject(request.error)
      }
      
      request.onsuccess = () => {
        this.db = request.result
        console.log('IndexedDB cache initialized successfully')
        resolve()
      }
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        
        // Clear old stores if they exist
        const storeNames = Array.from(db.objectStoreNames)
        storeNames.forEach(name => {
          if (db.objectStoreNames.contains(name)) {
            db.deleteObjectStore(name)
          }
        })
        
        // Message metadata store
        const messageStore = db.createObjectStore('messages', { keyPath: 'id' })
        messageStore.createIndex('threadId', 'threadId', { unique: false })
        messageStore.createIndex('category', 'category', { unique: false })
        messageStore.createIndex('timestamp', 'timestamp', { unique: false })
        messageStore.createIndex('gmailId', 'gmailId', { unique: false })
        messageStore.createIndex('cachedAt', 'cachedAt', { unique: false })
        messageStore.createIndex('lastAccessed', 'lastAccessed', { unique: false })
        
        // Full content store (separate for size optimization)
        const contentStore = db.createObjectStore('content', { keyPath: 'id' })
        contentStore.createIndex('lastAccessed', 'lastAccessed', { unique: false })
        contentStore.createIndex('size', 'size', { unique: false })
        contentStore.createIndex('cachedAt', 'cachedAt', { unique: false })
        
        // Cache metadata store
        const metadataStore = db.createObjectStore('metadata', { keyPath: 'category' })
        metadataStore.createIndex('lastFetched', 'lastFetched', { unique: false })
        
        console.log('IndexedDB schema upgraded to version', this.DB_VERSION)
      }
    })
  }

  /**
   * Get cached messages for a category
   */
  async getCachedMessages(category: string, limit = 50): Promise<{ emails: CachedEmail[], metadata: CacheMetadata | null }> {
    await this.ensureInitialized()
    
    const transaction = this.db!.transaction(['messages', 'metadata'], 'readonly')
    const messageStore = transaction.objectStore('messages')
    const metadataStore = transaction.objectStore('metadata')
    
    // Get metadata
    const metadataRequest = metadataStore.get(category)
    const metadata = await this.promisifyRequest<CacheMetadata | undefined>(metadataRequest)
    
    // Get messages
    const index = messageStore.index('category')
    const messagesRequest = index.getAll(IDBKeyRange.only(category))
    const allMessages = await this.promisifyRequest<CachedEmail[]>(messagesRequest)
    
    // Sort by timestamp (newest first) and limit
    const emails = allMessages
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit)
    
    // Update last accessed time for retrieved emails
    this.updateLastAccessed(emails.map(e => e.id))
    
    return {
      emails,
      metadata: metadata || null
    }
  }

  /**
   * Cache messages for a category
   */
  async cacheMessages(emails: any[], category: string, metadata?: Partial<CacheMetadata>): Promise<void> {
    await this.ensureInitialized()
    
    const transaction = this.db!.transaction(['messages', 'metadata'], 'readwrite')
    const messageStore = transaction.objectStore('messages')
    const metadataStore = transaction.objectStore('metadata')
    
    const now = Date.now()
    
    // Cache messages
    const cachePromises = emails.map(email => {
      const cachedEmail: CachedEmail = {
        id: email.id,
        threadId: email.threadId,
        category,
        subject: email.subject || '',
        from: email.from || '',
        to: email.to || [],
        date: email.date || new Date().toISOString(),
        snippet: email.snippet || '',
        isRead: email.isRead || false,
        isStarred: email.isStarred || false,
        hasAttachment: email.hasAttachment || false,
        labels: email.labels || [],
        gmailId: email.gmailId || email.id,
        timestamp: new Date(email.date || Date.now()).getTime(),
        cachedAt: now,
        lastAccessed: now
      }
      
      return this.promisifyRequest(messageStore.put(cachedEmail))
    })
    
    // Update metadata
    const cacheMetadata: CacheMetadata = {
      category,
      lastFetched: now,
      emailCount: emails.length,
      historyId: metadata?.historyId,
      nextPageToken: metadata?.nextPageToken,
      isValid: true
    }
    
    await Promise.all([
      ...cachePromises,
      this.promisifyRequest(metadataStore.put(cacheMetadata))
    ])
    
    console.log(`Cached ${emails.length} emails for category: ${category}`)
    
    // Cleanup old entries if needed
    this.cleanupOldEntries()
  }

  /**
   * Get cached email content
   */
  async getCachedContent(messageId: string): Promise<CachedContent | null> {
    await this.ensureInitialized()
    
    const transaction = this.db!.transaction(['content'], 'readonly')
    const store = transaction.objectStore('content')
    const request = store.get(messageId)
    
    const content = await this.promisifyRequest<CachedContent | undefined>(request)
    
    if (content) {
      // Update last accessed time
      this.updateContentAccess(messageId)
      return content
    }
    
    return null
  }

  /**
   * Cache email content
   */
  async cacheContent(messageId: string, content: any, etag?: string): Promise<void> {
    await this.ensureInitialized()
    
    const transaction = this.db!.transaction(['content'], 'readwrite')
    const store = transaction.objectStore('content')
    
    const contentSize = new Blob([JSON.stringify(content)]).size
    const now = Date.now()
    
    const cachedContent: CachedContent = {
      id: messageId,
      content,
      etag,
      cachedAt: now,
      lastAccessed: now,
      size: contentSize
    }
    
    await this.promisifyRequest(store.put(cachedContent))
    console.log(`Cached content for message ${messageId} (${contentSize} bytes)`)
  }

  /**
   * Check if cache is valid for a category
   */
  async isCacheValid(category: string, maxAgeMinutes = 5): Promise<boolean> {
    await this.ensureInitialized()
    
    const transaction = this.db!.transaction(['metadata'], 'readonly')
    const store = transaction.objectStore('metadata')
    const request = store.get(category)
    
    const metadata = await this.promisifyRequest<CacheMetadata | undefined>(request)
    
    if (!metadata || !metadata.isValid) {
      return false
    }
    
    const maxAge = maxAgeMinutes * 60 * 1000
    const age = Date.now() - metadata.lastFetched
    
    return age < maxAge
  }

  /**
   * Invalidate cache for a category
   */
  async invalidateCache(category: string): Promise<void> {
    await this.ensureInitialized()
    
    const transaction = this.db!.transaction(['metadata'], 'readwrite')
    const store = transaction.objectStore('metadata')
    
    const request = store.get(category)
    const metadata = await this.promisifyRequest<CacheMetadata | undefined>(request)
    
    if (metadata) {
      metadata.isValid = false
      await this.promisifyRequest(store.put(metadata))
      console.log(`Invalidated cache for category: ${category}`)
    }
  }

  /**
   * Clear all cached data
   */
  async clearCache(): Promise<void> {
    await this.ensureInitialized()
    
    const transaction = this.db!.transaction(['messages', 'content', 'metadata'], 'readwrite')
    
    await Promise.all([
      this.promisifyRequest(transaction.objectStore('messages').clear()),
      this.promisifyRequest(transaction.objectStore('content').clear()),
      this.promisifyRequest(transaction.objectStore('metadata').clear())
    ])
    
    console.log('All cache data cleared')
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<any> {
    await this.ensureInitialized()
    
    const transaction = this.db!.transaction(['messages', 'content', 'metadata'], 'readonly')
    
    const [messageCount, contentCount, metadataCount] = await Promise.all([
      this.promisifyRequest(transaction.objectStore('messages').count()),
      this.promisifyRequest(transaction.objectStore('content').count()),
      this.promisifyRequest(transaction.objectStore('metadata').count())
    ])
    
    // Calculate total size (approximate)
    const contentStore = transaction.objectStore('content')
    const sizeIndex = contentStore.index('size')
    const allContent = await this.promisifyRequest<CachedContent[]>(sizeIndex.getAll())
    const totalSize = allContent.reduce((sum, item) => sum + item.size, 0)
    
    return {
      messageCount,
      contentCount,
      metadataCount,
      totalSize,
      maxCacheSize: this.MAX_CACHE_SIZE,
      cacheUsagePercent: (totalSize / this.MAX_CACHE_SIZE) * 100
    }
  }

  /**
   * Update last accessed time for messages
   */
  private async updateLastAccessed(messageIds: string[]): Promise<void> {
    if (messageIds.length === 0) return
    
    const transaction = this.db!.transaction(['messages'], 'readwrite')
    const store = transaction.objectStore('messages')
    const now = Date.now()
    
    const updatePromises = messageIds.map(async (id) => {
      const request = store.get(id)
      const message = await this.promisifyRequest<CachedEmail | undefined>(request)
      if (message) {
        message.lastAccessed = now
        return this.promisifyRequest(store.put(message))
      }
    })
    
    await Promise.all(updatePromises)
  }

  /**
   * Update last accessed time for content
   */
  private async updateContentAccess(messageId: string): Promise<void> {
    const transaction = this.db!.transaction(['content'], 'readwrite')
    const store = transaction.objectStore('content')
    
    const request = store.get(messageId)
    const content = await this.promisifyRequest<CachedContent | undefined>(request)
    
    if (content) {
      content.lastAccessed = Date.now()
      await this.promisifyRequest(store.put(content))
    }
  }

  /**
   * Cleanup old entries to maintain cache size limits
   */
  private async cleanupOldEntries(): Promise<void> {
    try {
      const stats = await this.getCacheStats()
      
      // Clean up if we're over limits
      if (stats.messageCount > this.MAX_CACHED_EMAILS) {
        await this.cleanupOldMessages()
      }
      
      if (stats.contentCount > this.MAX_CACHED_CONTENT || stats.totalSize > this.MAX_CACHE_SIZE) {
        await this.cleanupOldContent()
      }
    } catch (error) {
      console.error('Cleanup failed:', error)
    }
  }

  /**
   * Remove oldest messages
   */
  private async cleanupOldMessages(): Promise<void> {
    const transaction = this.db!.transaction(['messages'], 'readwrite')
    const store = transaction.objectStore('messages')
    const index = store.index('lastAccessed')
    
    const request = index.openCursor()
    let deletedCount = 0
    const maxToDelete = this.MAX_CACHED_EMAILS * 0.2 // Delete 20% of oldest
    
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result
      if (cursor && deletedCount < maxToDelete) {
        cursor.delete()
        deletedCount++
        cursor.continue()
      }
    }
    
    await this.promisifyRequest(request)
    console.log(`Cleaned up ${deletedCount} old messages`)
  }

  /**
   * Remove oldest content
   */
  private async cleanupOldContent(): Promise<void> {
    const transaction = this.db!.transaction(['content'], 'readwrite')
    const store = transaction.objectStore('content')
    const index = store.index('lastAccessed')
    
    const request = index.openCursor()
    let deletedCount = 0
    const maxToDelete = this.MAX_CACHED_CONTENT * 0.3 // Delete 30% of oldest
    
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result
      if (cursor && deletedCount < maxToDelete) {
        cursor.delete()
        deletedCount++
        cursor.continue()
      }
    }
    
    await this.promisifyRequest(request)
    console.log(`Cleaned up ${deletedCount} old content entries`)
  }

  /**
   * Ensure database is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.db) {
      await this.initialize()
    }
  }

  /**
   * Convert IDBRequest to Promise
   */
  private promisifyRequest<T>(request: IDBRequest): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }
}

// Export singleton instance
let emailCache: EmailCache | null = null

export const getEmailCache = async (): Promise<EmailCache> => {
  if (!emailCache) {
    emailCache = new EmailCache()
    await emailCache.initialize()
  }
  return emailCache
}

// Convenience functions
export const getCachedEmails = async (category: string, limit = 50) => {
  const cache = await getEmailCache()
  return cache.getCachedMessages(category, limit)
}

export const cacheEmails = async (emails: any[], category: string, metadata?: any) => {
  const cache = await getEmailCache()
  return cache.cacheMessages(emails, category, metadata)
}

export const isCacheValid = async (category: string, maxAgeMinutes = 5) => {
  const cache = await getEmailCache()
  return cache.isCacheValid(category, maxAgeMinutes)
}

export const getCachedContent = async (messageId: string) => {
  const cache = await getEmailCache()
  return cache.getCachedContent(messageId)
}

export const cacheContent = async (messageId: string, content: any, etag?: string) => {
  const cache = await getEmailCache()
  return cache.cacheContent(messageId, content, etag)
}