import { google } from 'googleapis'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import indexedDBCache from '@/lib/indexeddb-cache'

interface GmailMessage {
  id: string
  threadId: string
  labelIds: string[]
  snippet: string
  historyId: string
  internalDate: string
  payload: {
    headers: Array<{ name: string; value: string }>
    body?: { data?: string }
    parts?: any[]
  }
  sizeEstimate: number
}

interface GmailListResponse {
  messages: Array<{ id: string; threadId: string }>
  nextPageToken?: string
  resultSizeEstimate: number
}

interface GmailHistoryResponse {
  history: Array<{
    id: string
    messages?: Array<{ id: string; threadId: string }>
    messagesAdded?: Array<{ message: GmailMessage }>
    messagesDeleted?: Array<{ message: { id: string; threadId: string } }>
    labelsAdded?: Array<{ message: GmailMessage; labelIds: string[] }>
    labelsRemoved?: Array<{ message: GmailMessage; labelIds: string[] }>
  }>
  nextPageToken?: string
  historyId: string
}

interface CacheEntry {
  data: any
  etag: string
  timestamp: number
  expires: number
}

class GmailAPIOptimized {
  private gmail: any
  private accessToken: string
  private cache = new Map<string, CacheEntry>()
  private readonly CACHE_TTL = 5 * 60 * 1000 // 5 minutes
  private readonly MAX_BATCH_SIZE = 100
  private readonly RATE_LIMIT_DELAY = 100 // ms between requests
  private lastRequestTime = 0

  constructor(accessToken: string) {
    this.accessToken = accessToken
    this.gmail = google.gmail({
      version: 'v1',
      auth: new google.auth.OAuth2()
    })
    this.gmail.auth.setCredentials({ access_token: accessToken })
  }

  // Rate limiting helper
  private async rateLimit(): Promise<void> {
    const now = Date.now()
    const timeSinceLastRequest = now - this.lastRequestTime
    
    if (timeSinceLastRequest < this.RATE_LIMIT_DELAY) {
      await new Promise(resolve => 
        setTimeout(resolve, this.RATE_LIMIT_DELAY - timeSinceLastRequest)
      )
    }
    
    this.lastRequestTime = Date.now()
  }

  // Cache management
  private getCacheKey(method: string, params: any): string {
    return `${method}:${JSON.stringify(params)}`
  }

  private getCachedData(key: string): any | null {
    const entry = this.cache.get(key)
    if (!entry) return null
    
    if (Date.now() > entry.expires) {
      this.cache.delete(key)
      return null
    }
    
    return entry.data
  }

  private setCachedData(key: string, data: any, etag?: string): void {
    this.cache.set(key, {
      data,
      etag: etag || '',
      timestamp: Date.now(),
      expires: Date.now() + this.CACHE_TTL
    })
  }

  // Enhanced request with ETag support
  private async makeRequest(
    method: string, 
    params: any, 
    useCache: boolean = true
  ): Promise<any> {
    await this.rateLimit()
    
    const cacheKey = this.getCacheKey(method, params)
    
    if (useCache) {
      const cached = this.getCachedData(cacheKey)
      if (cached) {
        return cached
      }
    }
    
    try {
      const headers: any = {
        'Authorization': `Bearer ${this.accessToken}`,
        'Accept': 'application/json'
      }
      
      // Add ETag header if we have one cached
      const cachedEntry = this.cache.get(cacheKey)
      if (cachedEntry?.etag) {
        headers['If-None-Match'] = cachedEntry.etag
      }
      
      const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/${method}?${new URLSearchParams(params)}`,
        { headers }
      )
      
      // Handle 304 Not Modified
      if (response.status === 304 && cachedEntry) {
        // Extend cache expiry
        cachedEntry.expires = Date.now() + this.CACHE_TTL
        return cachedEntry.data
      }
      
      if (!response.ok) {
        throw new Error(`Gmail API error: ${response.status} ${response.statusText}`)
      }
      
      const data = await response.json()
      const etag = response.headers.get('ETag')
      
      if (useCache) {
        this.setCachedData(cacheKey, data, etag || undefined)
      }
      
      return data
    } catch (error) {
      console.error(`Gmail API request failed for ${method}:`, error)
      throw error
    }
  }

  // List messages with optimizations
  async listMessages(
    labelIds: string[] = ['INBOX'],
    maxResults: number = 50,
    pageToken?: string,
    q?: string
  ): Promise<GmailListResponse> {
    const params: any = {
      labelIds: labelIds.join(','),
      maxResults: Math.min(maxResults, this.MAX_BATCH_SIZE).toString()
    }
    
    if (pageToken) params.pageToken = pageToken
    if (q) params.q = q
    
    return this.makeRequest('messages', params)
  }

  // Get message with caching
  async getMessage(
    messageId: string, 
    format: 'minimal' | 'metadata' | 'full' = 'metadata'
  ): Promise<GmailMessage> {
    const params = { format }
    return this.makeRequest(`messages/${messageId}`, params)
  }

  // Batch get messages with chunking
  async batchGetMessages(
    messageIds: string[], 
    format: 'minimal' | 'metadata' | 'full' = 'metadata'
  ): Promise<GmailMessage[]> {
    if (messageIds.length === 0) return []
    
    const chunks = this.chunkArray(messageIds, this.MAX_BATCH_SIZE)
    const results: GmailMessage[] = []
    
    for (const chunk of chunks) {
      const promises = chunk.map(id => this.getMessage(id, format))
      const chunkResults = await Promise.allSettled(promises)
      
      chunkResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value)
        } else {
          console.error(`Failed to fetch message ${chunk[index]}:`, result.reason)
        }
      })
      
      // Small delay between chunks to avoid rate limiting
      if (chunks.indexOf(chunk) < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, this.RATE_LIMIT_DELAY))
      }
    }
    
    return results
  }

  // Get history with delta sync
  async getHistory(
    startHistoryId: string,
    labelIds?: string[],
    maxResults: number = 100
  ): Promise<GmailHistoryResponse> {
    const params: any = {
      startHistoryId,
      maxResults: Math.min(maxResults, this.MAX_BATCH_SIZE).toString()
    }
    
    if (labelIds && labelIds.length > 0) {
      params.labelId = labelIds
    }
    
    return this.makeRequest('history', params, false) // Don't cache history
  }

  // Watch Gmail for changes
  async watchGmail(
    labelIds: string[] = ['INBOX'],
    topicName: string
  ): Promise<{ historyId: string; expiration: string }> {
    await this.rateLimit()
    
    const response = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/watch',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          labelIds,
          topicName
        })
      }
    )
    
    if (!response.ok) {
      throw new Error(`Watch request failed: ${response.status} ${response.statusText}`)
    }
    
    return response.json()
  }

  // Stop watching Gmail
  async stopWatch(): Promise<void> {
    await this.rateLimit()
    
    const response = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/stop',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      }
    )
    
    if (!response.ok) {
      throw new Error(`Stop watch failed: ${response.status} ${response.statusText}`)
    }
  }

  // Modify message labels
  async modifyMessage(
    messageId: string,
    addLabelIds: string[] = [],
    removeLabelIds: string[] = []
  ): Promise<GmailMessage> {
    await this.rateLimit()
    
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          addLabelIds,
          removeLabelIds
        })
      }
    )
    
    if (!response.ok) {
      throw new Error(`Modify message failed: ${response.status} ${response.statusText}`)
    }
    
    const result = await response.json()
    
    // Invalidate cache for this message
    const cacheKeys = Array.from(this.cache.keys()).filter(key => 
      key.includes(messageId)
    )
    cacheKeys.forEach(key => this.cache.delete(key))
    
    return result
  }

  // Batch modify messages
  async batchModifyMessages(
    operations: Array<{
      messageId: string
      addLabelIds?: string[]
      removeLabelIds?: string[]
    }>
  ): Promise<GmailMessage[]> {
    if (operations.length === 0) return []
    
    const chunks = this.chunkArray(operations, this.MAX_BATCH_SIZE)
    const results: GmailMessage[] = []
    
    for (const chunk of chunks) {
      const promises = chunk.map(op => 
        this.modifyMessage(
          op.messageId, 
          op.addLabelIds || [], 
          op.removeLabelIds || []
        )
      )
      
      const chunkResults = await Promise.allSettled(promises)
      
      chunkResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value)
        } else {
          console.error(`Failed to modify message ${chunk[index].messageId}:`, result.reason)
        }
      })
      
      // Small delay between chunks
      if (chunks.indexOf(chunk) < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, this.RATE_LIMIT_DELAY))
      }
    }
    
    return results
  }

  // Get user profile
  async getProfile(): Promise<any> {
    return this.makeRequest('profile', {})
  }

  // Get labels
  async getLabels(): Promise<any> {
    return this.makeRequest('labels', {})
  }

  // Utility: chunk array
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }

  // Clear cache
  clearCache(): void {
    this.cache.clear()
  }

  // Get cache stats
  getCacheStats(): { size: number; entries: number } {
    return {
      size: JSON.stringify(Array.from(this.cache.entries())).length,
      entries: this.cache.size
    }
  }
}

// Factory function to create Gmail API instance
export async function createGmailAPI(): Promise<GmailAPIOptimized> {
  const session = await getServerSession(authOptions)
  
  if (!session?.accessToken) {
    throw new Error('No access token available')
  }
  
  return new GmailAPIOptimized(session.accessToken as string)
}

export { GmailAPIOptimized }
export type { GmailMessage, GmailListResponse, GmailHistoryResponse }