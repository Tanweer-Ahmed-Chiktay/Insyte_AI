import { google } from 'googleapis'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

interface BatchRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  body?: any
  headers?: Record<string, string>
}

interface BatchResponse {
  status: number
  headers: Record<string, string>
  body: any
}

interface BatchResult {
  responses: BatchResponse[]
  errors: Array<{ index: number; error: any }>
}

/**
 * Gmail Batch API Service
 * Optimizes Gmail API calls by batching multiple requests into single HTTP calls
 * Reduces latency and API quota usage
 */
export class GmailBatchService {
  private gmail: any
  private accessToken: string

  constructor(accessToken: string) {
    this.accessToken = accessToken
    this.gmail = google.gmail({ version: 'v1' })
  }

  /**
   * Execute multiple Gmail API requests in a single batch
   * @param requests Array of batch requests
   * @returns Batch results with responses and errors
   */
  async executeBatch(requests: BatchRequest[]): Promise<BatchResult> {
    if (requests.length === 0) {
      return { responses: [], errors: [] }
    }

    // Gmail API supports up to 100 requests per batch
    const maxBatchSize = 100
    const batches = this.chunkArray(requests, maxBatchSize)
    
    const allResponses: BatchResponse[] = []
    const allErrors: Array<{ index: number; error: any }> = []

    for (const batch of batches) {
      try {
        const batchResult = await this.executeSingleBatch(batch)
        allResponses.push(...batchResult.responses)
        allErrors.push(...batchResult.errors)
      } catch (error) {
        // If entire batch fails, mark all requests as errors
        batch.forEach((_, index) => {
          allErrors.push({ index: allResponses.length + index, error })
        })
      }
    }

    return { responses: allResponses, errors: allErrors }
  }

  /**
   * Batch fetch multiple messages by ID
   * @param messageIds Array of Gmail message IDs
   * @param format Message format (full, metadata, minimal)
   * @returns Array of message objects
   */
  async batchGetMessages(
    messageIds: string[],
    format: 'full' | 'metadata' | 'minimal' = 'metadata'
  ): Promise<any[]> {
    if (messageIds.length === 0) return []

    const requests: BatchRequest[] = messageIds.map(id => ({
      method: 'GET',
      path: `/gmail/v1/users/me/messages/${id}?format=${format}`,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      }
    }))

    const result = await this.executeBatch(requests)
    return result.responses
      .filter(response => response.status === 200)
      .map(response => response.body)
  }

  /**
   * Batch modify labels for multiple messages
   * @param modifications Array of label modifications
   * @returns Array of modification results
   */
  async batchModifyLabels(
    modifications: Array<{
      messageId: string
      addLabelIds?: string[]
      removeLabelIds?: string[]
    }>
  ): Promise<any[]> {
    if (modifications.length === 0) return []

    const requests: BatchRequest[] = modifications.map(mod => ({
      method: 'POST',
      path: `/gmail/v1/users/me/messages/${mod.messageId}/modify`,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: {
        addLabelIds: mod.addLabelIds || [],
        removeLabelIds: mod.removeLabelIds || []
      }
    }))

    const result = await this.executeBatch(requests)
    return result.responses
      .filter(response => response.status === 200)
      .map(response => response.body)
  }

  /**
   * Batch fetch message history for delta sync
   * @param historyIds Array of history IDs to fetch
   * @returns Array of history objects
   */
  async batchGetHistory(historyIds: string[]): Promise<any[]> {
    if (historyIds.length === 0) return []

    const requests: BatchRequest[] = historyIds.map(historyId => ({
      method: 'GET',
      path: `/gmail/v1/users/me/history?startHistoryId=${historyId}`,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      }
    }))

    const result = await this.executeBatch(requests)
    return result.responses
      .filter(response => response.status === 200)
      .map(response => response.body)
  }

  /**
   * Execute a single batch of requests
   * @param requests Array of requests for this batch
   * @returns Batch result for this specific batch
   */
  private async executeSingleBatch(requests: BatchRequest[]): Promise<BatchResult> {
    // Create multipart batch request body
    const boundary = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const batchBody = this.createBatchBody(requests, boundary)

    try {
      const response = await fetch('https://www.googleapis.com/batch/gmail/v1', {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/mixed; boundary=${boundary}`,
          'Authorization': `Bearer ${this.accessToken}`
        },
        body: batchBody
      })

      if (!response.ok) {
        throw new Error(`Batch request failed: ${response.status} ${response.statusText}`)
      }

      const responseText = await response.text()
      return this.parseBatchResponse(responseText)
    } catch (error) {
      console.error('Batch execution failed:', error)
      throw error
    }
  }

  /**
   * Create multipart batch request body
   * @param requests Array of requests
   * @param boundary Multipart boundary string
   * @returns Formatted batch request body
   */
  private createBatchBody(requests: BatchRequest[], boundary: string): string {
    let body = ''

    requests.forEach((request, index) => {
      body += `--${boundary}\r\n`
      body += `Content-Type: application/http\r\n`
      body += `Content-ID: ${index + 1}\r\n\r\n`
      
      body += `${request.method} ${request.path} HTTP/1.1\r\n`
      
      if (request.headers) {
        Object.entries(request.headers).forEach(([key, value]) => {
          body += `${key}: ${value}\r\n`
        })
      }
      
      body += '\r\n'
      
      if (request.body) {
        body += JSON.stringify(request.body)
      }
      
      body += '\r\n'
    })

    body += `--${boundary}--\r\n`
    return body
  }

  /**
   * Parse multipart batch response
   * @param responseText Raw batch response text
   * @returns Parsed batch result
   */
  private parseBatchResponse(responseText: string): BatchResult {
    const responses: BatchResponse[] = []
    const errors: Array<{ index: number; error: any }> = []

    // Split response by boundary
    const parts = responseText.split(/--batch_[^\r\n]+/)
    
    parts.forEach((part, index) => {
      if (!part.trim() || index === 0 || index === parts.length - 1) return

      try {
        const lines = part.split('\r\n')
        let statusLine = ''
        let headers: Record<string, string> = {}
        let bodyStart = -1

        // Find status line and headers
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]
          if (line.startsWith('HTTP/')) {
            statusLine = line
          } else if (line.includes(':') && bodyStart === -1) {
            const [key, value] = line.split(': ', 2)
            headers[key] = value
          } else if (line === '' && bodyStart === -1) {
            bodyStart = i + 1
            break
          }
        }

        // Extract status code
        const statusMatch = statusLine.match(/HTTP\/\d\.\d (\d+)/)
        const status = statusMatch ? parseInt(statusMatch[1]) : 500

        // Extract body
        let body = ''
        if (bodyStart !== -1) {
          body = lines.slice(bodyStart).join('\r\n').trim()
        }

        // Parse JSON body if possible
        let parsedBody = body
        try {
          if (body && headers['Content-Type']?.includes('application/json')) {
            parsedBody = JSON.parse(body)
          }
        } catch (e) {
          // Keep as string if not valid JSON
        }

        responses.push({
          status,
          headers,
          body: parsedBody
        })
      } catch (error) {
        errors.push({ index: responses.length, error })
      }
    })

    return { responses, errors }
  }

  /**
   * Split array into chunks of specified size
   * @param array Array to chunk
   * @param size Chunk size
   * @returns Array of chunks
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }
}

/**
 * Create a Gmail batch service instance with current user's access token
 * @returns GmailBatchService instance or null if no session
 */
export async function createGmailBatchService(): Promise<GmailBatchService | null> {
  const session = await getServerSession(authOptions)
  
  if (!session?.accessToken) {
    return null
  }

  return new GmailBatchService(session.accessToken as string)
}

/**
 * Utility function to batch process Gmail operations with rate limiting
 * @param operations Array of operations to execute
 * @param batchSize Size of each batch
 * @param delayMs Delay between batches in milliseconds
 * @returns Array of results
 */
export async function batchProcessWithRateLimit<T, R>(
  operations: T[],
  processor: (batch: T[]) => Promise<R[]>,
  batchSize: number = 50,
  delayMs: number = 100
): Promise<R[]> {
  const results: R[] = []
  const batches = []
  
  // Split into batches
  for (let i = 0; i < operations.length; i += batchSize) {
    batches.push(operations.slice(i, i + batchSize))
  }

  // Process batches with delay
  for (let i = 0; i < batches.length; i++) {
    const batchResults = await processor(batches[i])
    results.push(...batchResults)
    
    // Add delay between batches (except for the last one)
    if (i < batches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }

  return results
}