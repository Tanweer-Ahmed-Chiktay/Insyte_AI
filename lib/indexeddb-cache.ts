import { Email } from '@/lib/email-store'

interface CachedEmail {
  id: string
  gmailId: string
  threadId?: string
  subject: string
  from: string
  to: string[]
  snippet: string
  content?: string // Full content cached for recent emails only
  labels: string[]
  labelIds: string[]
  isRead: boolean
  isStarred: boolean
  isImportant: boolean
  receivedAt: string
  category: string
  cachedAt: number
  etag?: string
  // Optional fields for sync tracking
  lastSyncedAt?: string
  syncVersion?: number
  summary?: {
    id: string
    summary: string
    keyPoints: string[]
    actionItems: string[]
    createdAt: string
    updatedAt: string
  }
}

interface CacheMetadata {
  category: string
  lastSync: number
  historyId?: string
  totalEmails: number
  hasMore: boolean
  nextOlderThan?: string
}

class IndexedDBCache {
  private dbName = 'insyte-gmail-cache'
  private version = 1
  private db: IDBDatabase | null = null
  private initPromise: Promise<void> | null = null

  constructor() {
    this.initPromise = this.init()
  }

  private async init(): Promise<void> {
    // Check if we're in a browser environment
    if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
      throw new Error('IndexedDB is not available in this environment')
    }
    
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version)
      
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        
        // Create emails store
        if (!db.objectStoreNames.contains('emails')) {
          const emailStore = db.createObjectStore('emails', { keyPath: 'gmailId' })
          emailStore.createIndex('category', 'category', { unique: false })
          emailStore.createIndex('receivedAt', 'receivedAt', { unique: false })
          emailStore.createIndex('threadId', 'threadId', { unique: false })
          emailStore.createIndex('cachedAt', 'cachedAt', { unique: false })
        }
        
        // Create metadata store
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'category' })
        }
        
        // Create full content store (for recent emails only)
        if (!db.objectStoreNames.contains('content')) {
          const contentStore = db.createObjectStore('content', { keyPath: 'gmailId' })
          contentStore.createIndex('cachedAt', 'cachedAt', { unique: false })
        }
      }
    })
  }

  private async ensureDB(): Promise<IDBDatabase> {
    if (!this.initPromise) {
      this.initPromise = this.init()
    }
    await this.initPromise
    if (!this.db) {
      throw new Error('Failed to initialize IndexedDB')
    }
    return this.db
  }

  // Cache emails for a category
  async cacheEmails(category: string, emails: Email[], metadata: Partial<CacheMetadata> = {}): Promise<void> {
    const db = await this.ensureDB()
    const transaction = db.transaction(['emails', 'metadata'], 'readwrite')
    const emailStore = transaction.objectStore('emails')
    const metadataStore = transaction.objectStore('metadata')
    
    const now = Date.now()
    
    // Cache emails
    for (const email of emails) {
      const cachedEmail: CachedEmail = {
        ...email,
        threadId: email.threadId || '',
        labelIds: email.labelIds || email.labels || [],
        category,
        cachedAt: now,
        // Don't cache full content in main store to save space
        content: undefined
      }
      await emailStore.put(cachedEmail)
    }
    
    // Update metadata
    const cacheMetadata: CacheMetadata = {
      category,
      lastSync: now,
      totalEmails: emails.length,
      hasMore: false,
      ...metadata
    }
    await metadataStore.put(cacheMetadata)
    
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
  }

  // Get cached emails for a category
  async getCachedEmails(category: string, limit: number = 50): Promise<{ emails: Email[], metadata: CacheMetadata | null }> {
    const db = await this.ensureDB()
    const transaction = db.transaction(['emails', 'metadata'], 'readonly')
    const emailStore = transaction.objectStore('emails')
    const metadataStore = transaction.objectStore('metadata')
    
    // Get metadata
    const metadataRequest = metadataStore.get(category)
    const metadata = await new Promise<CacheMetadata | null>((resolve, reject) => {
      metadataRequest.onsuccess = () => resolve(metadataRequest.result || null)
      metadataRequest.onerror = () => reject(metadataRequest.error)
    })
    
    // Get emails
    const index = emailStore.index('category')
    const emailsRequest = index.getAll(category)
    const cachedEmails = await new Promise<CachedEmail[]>((resolve, reject) => {
      emailsRequest.onsuccess = () => resolve(emailsRequest.result || [])
      emailsRequest.onerror = () => reject(emailsRequest.error)
    })
    
    // Sort by receivedAt and limit
    const sortedEmails = cachedEmails
      .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
      .slice(0, limit)
    
    // Convert CachedEmail back to Email format
    const convertedEmails: Email[] = sortedEmails.map(cached => ({
      id: cached.id,
      gmailId: cached.gmailId,
      subject: cached.subject,
      from: cached.from,
      to: cached.to,
      snippet: cached.snippet,
      isRead: cached.isRead,
      isStarred: cached.isStarred,
      isImportant: cached.isImportant,
      labelIds: cached.labelIds,
      labels: cached.labels,
      receivedAt: cached.receivedAt,
      category: cached.category,
      threadId: cached.threadId,
      lastSyncedAt: cached.lastSyncedAt,
      syncVersion: cached.syncVersion,
      summary: cached.summary
    }))
    
    return { emails: convertedEmails, metadata }
  }

  // Cache full email content (for recent emails only)
  async cacheEmailContent(gmailId: string, content: string, etag?: string): Promise<void> {
    const db = await this.ensureDB()
    const transaction = db.transaction(['content'], 'readwrite')
    const contentStore = transaction.objectStore('content')
    
    const contentData = {
      gmailId,
      content,
      etag,
      cachedAt: Date.now()
    }
    
    await contentStore.put(contentData)
    
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
  }

  // Get cached email content
  async getCachedEmailContent(gmailId: string): Promise<{ content: string, etag?: string } | null> {
    const db = await this.ensureDB()
    const transaction = db.transaction(['content'], 'readonly')
    const contentStore = transaction.objectStore('content')
    
    const request = contentStore.get(gmailId)
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const result = request.result
        if (result) {
          resolve({ content: result.content, etag: result.etag })
        } else {
          resolve(null)
        }
      }
      request.onerror = () => reject(request.error)
    })
  }

  // Check if cache is valid for a category
  async isCacheValid(category: string, maxAgeMinutes: number = 5): Promise<boolean> {
    const { metadata } = await this.getCachedEmails(category, 1)
    if (!metadata) return false
    
    const maxAge = maxAgeMinutes * 60 * 1000
    return (Date.now() - metadata.lastSync) < maxAge
  }

  // Clear old cache entries
  async clearOldCache(maxAgeHours: number = 24): Promise<void> {
    const db = await this.ensureDB()
    const transaction = db.transaction(['emails', 'content'], 'readwrite')
    const emailStore = transaction.objectStore('emails')
    const contentStore = transaction.objectStore('content')
    
    const cutoffTime = Date.now() - (maxAgeHours * 60 * 60 * 1000)
    
    // Clear old emails
    const emailIndex = emailStore.index('cachedAt')
    const emailRange = IDBKeyRange.upperBound(cutoffTime)
    const emailCursor = emailIndex.openCursor(emailRange)
    if (emailCursor) {
      emailCursor.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result
        if (cursor) {
          cursor.delete()
          cursor.continue()
        }
      }
    }
    
    // Clear old content
    const contentIndex = contentStore.index('cachedAt')
    const contentRange = IDBKeyRange.upperBound(cutoffTime)
    const contentCursor = contentIndex.openCursor(contentRange)
    if (contentCursor) {
      contentCursor.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result
        if (cursor) {
          cursor.delete()
          cursor.continue()
        }
      }
    }
    
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
  }

  // Get cache statistics
  async getCacheStats(): Promise<{ totalEmails: number, totalContent: number, categories: string[] }> {
    const db = await this.ensureDB()
    const transaction = db.transaction(['emails', 'content', 'metadata'], 'readonly')
    
    const emailStore = transaction.objectStore('emails')
    const contentStore = transaction.objectStore('content')
    const metadataStore = transaction.objectStore('metadata')
    
    const [emailCount, contentCount, categories] = await Promise.all([
      new Promise<number>((resolve, reject) => {
        const request = emailStore.count()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      }),
      new Promise<number>((resolve, reject) => {
        const request = contentStore.count()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      }),
      new Promise<string[]>((resolve, reject) => {
        const request = metadataStore.getAllKeys()
        request.onsuccess = () => resolve(request.result as string[])
        request.onerror = () => reject(request.error)
      })
    ])
    
    return {
      totalEmails: emailCount,
      totalContent: contentCount,
      categories
    }
  }

  // Clear all cache
  async clearAllCache(): Promise<void> {
    const db = await this.ensureDB()
    const transaction = db.transaction(['emails', 'content', 'metadata'], 'readwrite')
    
    await Promise.all([
      transaction.objectStore('emails').clear(),
      transaction.objectStore('content').clear(),
      transaction.objectStore('metadata').clear()
    ])
    
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
  }
}

// Singleton instance
const indexedDBCache = new IndexedDBCache()

export default indexedDBCache
export type { CachedEmail, CacheMetadata }