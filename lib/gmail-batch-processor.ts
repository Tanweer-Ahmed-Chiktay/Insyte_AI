// Gmail Batch Processor - Optimizes API calls with batching and concurrency control
// Reduces rate limiting and improves performance through efficient batch operations

export interface BatchRequest {
  messageId: string
  format: 'minimal' | 'metadata' | 'full'
}

export interface BatchResult {
  messageId: string
  success: boolean
  data?: any
  error?: string
}

export class GmailBatchProcessor {
  private static readonly BATCH_SIZE = 100
  private static readonly MAX_CONCURRENT_BATCHES = 3
  private static readonly REQUEST_TIMEOUT = 30000 // 30 seconds
  
  private accessToken: string | null = null
  private processingQueue = new Map<string, Promise<BatchResult[]>>()

  constructor(accessToken?: string) {
    this.accessToken = accessToken || null
  }

  /**
   * Set or update the access token
   */
  setAccessToken(token: string): void {
    this.accessToken = token
  }

  /**
   * Fetch multiple messages in optimized batches
   */
  async fetchMessagesBatch(
    messageIds: string[], 
    format: 'minimal' | 'metadata' | 'full' = 'metadata'
  ): Promise<BatchResult[]> {
    if (!this.accessToken) {
      throw new Error('Access token not set for batch processor')
    }

    if (messageIds.length === 0) {
      return []
    }

    // Create batch key for deduplication
    const batchKey = this.createBatchKey(messageIds, format)
    
    // Check if this exact batch is already being processed
    if (this.processingQueue.has(batchKey)) {
      console.log(`Batch already processing, returning existing promise`)
      return this.processingQueue.get(batchKey)!
    }

    // Start batch processing
    const batchPromise = this.processBatchInternal(messageIds, format)
    this.processingQueue.set(batchKey, batchPromise)
    
    // Clean up after completion
    batchPromise.finally(() => {
      this.processingQueue.delete(batchKey)
    })

    return batchPromise
  }

  /**
   * Internal batch processing with concurrency control
   */
  private async processBatchInternal(
    messageIds: string[], 
    format: 'minimal' | 'metadata' | 'full'
  ): Promise<BatchResult[]> {
    console.log(`Processing batch of ${messageIds.length} messages with format: ${format}`)
    
    // Split into smaller batches
    const batches = this.chunkArray(messageIds, GmailBatchProcessor.BATCH_SIZE)
    const allResults: BatchResult[] = []
    
    // Process batches with concurrency limit
    for (let i = 0; i < batches.length; i += GmailBatchProcessor.MAX_CONCURRENT_BATCHES) {
      const batchGroup = batches.slice(i, i + GmailBatchProcessor.MAX_CONCURRENT_BATCHES)
      
      console.log(`Processing batch group ${Math.floor(i / GmailBatchProcessor.MAX_CONCURRENT_BATCHES) + 1}/${Math.ceil(batches.length / GmailBatchProcessor.MAX_CONCURRENT_BATCHES)}`)
      
      const batchPromises = batchGroup.map(batch => 
        this.processSingleBatch(batch, format)
      )
      
      const batchResults = await Promise.allSettled(batchPromises)
      
      // Collect results and handle errors
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          allResults.push(...result.value)
        } else {
          console.error(`Batch ${i + index} failed:`, result.reason)
          // Add error results for failed batch
          const failedBatch = batchGroup[index]
          const errorResults = failedBatch.map(messageId => ({
            messageId,
            success: false,
            error: result.reason?.message || 'Batch processing failed'
          }))
          allResults.push(...errorResults)
        }
      })
    }
    
    console.log(`Batch processing completed: ${allResults.filter(r => r.success).length}/${allResults.length} successful`)
    return allResults
  }

  /**
   * Process a single batch using Gmail's batch API
   */
  private async processSingleBatch(
    messageIds: string[], 
    format: string
  ): Promise<BatchResult[]> {
    try {
      // Use Gmail's batch endpoint for efficiency
      const boundary = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      const body = this.createBatchBody(messageIds, format, boundary)
      
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), GmailBatchProcessor.REQUEST_TIMEOUT)
      
      const response = await fetch('https://gmail.googleapis.com/batch/gmail/v1', {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/mixed; boundary=${boundary}`,
          'Authorization': `Bearer ${this.accessToken}`
        },
        body,
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      
      if (!response.ok) {
        throw new Error(`Batch request failed: ${response.status} ${response.statusText}`)
      }
      
      const responseText = await response.text()
      return this.parseBatchResponse(responseText, messageIds)
      
    } catch (error: any) {
      console.error('Single batch processing failed:', error)
      
      // Return error results for all messages in this batch
      return messageIds.map(messageId => ({
        messageId,
        success: false,
        error: error.message || 'Unknown batch error'
      }))
    }
  }

  /**
   * Create the multipart body for Gmail batch request
   */
  private createBatchBody(messageIds: string[], format: string, boundary: string): string {
    const parts = messageIds.map((messageId, index) => {
      return [
        `--${boundary}`,
        'Content-Type: application/http',
        `Content-ID: <item${index}>`,
        '',
        `GET /gmail/v1/users/me/messages/${messageId}?format=${format}`,
        ''
      ].join('\r\n')
    })
    
    return parts.join('\r\n') + `\r\n--${boundary}--\r\n`
  }

  /**
   * Parse the multipart response from Gmail batch API
   */
  private parseBatchResponse(responseText: string, messageIds: string[]): BatchResult[] {
    const results: BatchResult[] = []
    
    try {
      // Split response by boundary
      const parts = responseText.split(/--batch_[^\r\n]+/)
      
      messageIds.forEach((messageId, index) => {
        try {
          // Find the corresponding response part
          const partIndex = index + 1 // Skip first empty part
          if (partIndex < parts.length) {
            const part = parts[partIndex]
            
            // Extract HTTP status and JSON body
            const statusMatch = part.match(/HTTP\/1\.1 (\d+)/)
            const status = statusMatch ? parseInt(statusMatch[1]) : 500
            
            if (status === 200) {
              // Extract JSON from the part
              const jsonStart = part.indexOf('{')
              if (jsonStart !== -1) {
                const jsonText = part.substring(jsonStart).trim()
                const data = JSON.parse(jsonText)
                
                results.push({
                  messageId,
                  success: true,
                  data
                })
              } else {
                results.push({
                  messageId,
                  success: false,
                  error: 'No JSON data in response'
                })
              }
            } else {
              results.push({
                messageId,
                success: false,
                error: `HTTP ${status}`
              })
            }
          } else {
            results.push({
              messageId,
              success: false,
              error: 'Missing response part'
            })
          }
        } catch (error: any) {
          results.push({
            messageId,
            success: false,
            error: `Parse error: ${error.message}`
          })
        }
      })
    } catch (error: any) {
      console.error('Failed to parse batch response:', error)
      
      // Return error results for all messages
      return messageIds.map(messageId => ({
        messageId,
        success: false,
        error: `Response parse error: ${error.message}`
      }))
    }
    
    return results
  }

  /**
   * Utility function to chunk array into smaller arrays
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize))
    }
    return chunks
  }

  /**
   * Create a unique key for batch deduplication
   */
  private createBatchKey(messageIds: string[], format: string): string {
    const sortedIds = [...messageIds].sort()
    return `${format}-${sortedIds.join(',')}`
  }

  /**
   * Get statistics about current processing
   */
  getStats() {
    return {
      activeQueues: this.processingQueue.size,
      queueKeys: Array.from(this.processingQueue.keys())
    }
  }

  /**
   * Clear all processing queues (emergency stop)
   */
  clearQueues(): void {
    this.processingQueue.clear()
  }
}

// Export singleton instance
let batchProcessor: GmailBatchProcessor | null = null

export const getBatchProcessor = (accessToken?: string): GmailBatchProcessor => {
  if (!batchProcessor) {
    batchProcessor = new GmailBatchProcessor(accessToken)
  } else if (accessToken) {
    batchProcessor.setAccessToken(accessToken)
  }
  return batchProcessor
}

// Convenience function for batch fetching
export const batchFetchMessages = async (
  messageIds: string[], 
  format: 'minimal' | 'metadata' | 'full' = 'metadata',
  accessToken?: string
): Promise<BatchResult[]> => {
  const processor = getBatchProcessor(accessToken)
  return processor.fetchMessagesBatch(messageIds, format)
}