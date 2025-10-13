import {
  getEmailCache,
  getCachedEmails as getCachedEmailsNew,
  cacheEmails as cacheEmailsNew,
  getCachedContent,
  cacheContent,
  isCacheValid as isCacheValidNew,
  EmailCache,
  CachedEmail,
  CacheMetadata
} from '@/lib/indexed-db-cache'

// Thin adapter that preserves the legacy public API while delegating to the
// unified cache implementation in indexed-db-cache.ts.
class IndexedDBCacheAdapter {
  async cacheEmails(category: string, emails: any[], metadata: Partial<CacheMetadata> = {}): Promise<void> {
    await cacheEmailsNew(emails, category, metadata)
  }

  async getCachedEmails(category: string, limit: number = 50): Promise<{ emails: any[], metadata: CacheMetadata | null }> {
    return getCachedEmailsNew(category, limit)
  }

  async cacheEmailContent(gmailId: string, content: any, etag?: string): Promise<void> {
    await cacheContent(gmailId, content, etag)
  }

  async getCachedEmailContent(gmailId: string): Promise<{ content: any, etag?: string } | null> {
    const cached = await getCachedContent(gmailId)
    if (!cached) return null
    return { content: cached.content, etag: cached.etag }
  }

  async isCacheValid(category: string, maxAgeMinutes: number = 5): Promise<boolean> {
    return isCacheValidNew(category, maxAgeMinutes)
  }

  async clearOldCache(_maxAgeHours: number = 24): Promise<void> {
    const cache = await getEmailCache()
    await cache.clearCache()
  }

  async getCacheStats(): Promise<{ totalEmails: number, totalContent: number, categories: string[] }> {
    const cache = await getEmailCache()
    const stats = await cache.getCacheStats()
    return {
      totalEmails: stats.messageCount ?? 0,
      totalContent: stats.contentCount ?? 0,
      categories: []
    }
  }

  async clearAllCache(): Promise<void> {
    const cache = await getEmailCache()
    await cache.clearCache()
  }
}

const indexedDBCache = new IndexedDBCacheAdapter()

export default indexedDBCache
export type { CachedEmail, CacheMetadata, EmailCache }