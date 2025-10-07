'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { EmailParseRequest, EmailParseResponse } from '@/lib/email-parser.worker'

interface WorkerManager {
  parseEmail: (content: string) => Promise<any>
  convertHtmlToText: (html: string) => Promise<string>
  extractMetadata: (headers: Record<string, string>) => Promise<any>
  isWorkerSupported: boolean
  isServiceWorkerSupported: boolean
  registerServiceWorker: () => Promise<boolean>
}

interface PendingRequest {
  resolve: (value: any) => void
  reject: (error: Error) => void
  timeout: NodeJS.Timeout
}

export function useWorkerManager(): WorkerManager {
  const workerRef = useRef<Worker | null>(null)
  const pendingRequests = useRef<Map<string, PendingRequest>>(new Map())
  const [isWorkerSupported] = useState(() => typeof Worker !== 'undefined')
  const [isServiceWorkerSupported] = useState(() => 
    typeof navigator !== 'undefined' && 'serviceWorker' in navigator
  )
  const requestIdCounter = useRef(0)

  // Initialize web worker
  useEffect(() => {
    if (!isWorkerSupported) return

    const currentPendingRequests = pendingRequests.current

    try {
      // Create worker from the TypeScript file
      // Note: In production, this would need to be compiled to JS
      const workerBlob = new Blob([
        `
        // Inline worker code for email parsing
        function htmlToText(html) {
          const tempDiv = document.createElement('div')
          tempDiv.innerHTML = html
          const scripts = tempDiv.querySelectorAll('script, style')
          scripts.forEach(el => el.remove())
          return tempDiv.textContent || tempDiv.innerText || ''
        }
        
        function extractMetadata(headers) {
          return {
            messageId: headers['Message-ID'] || headers['message-id'],
            inReplyTo: headers['In-Reply-To'] || headers['in-reply-to'],
            references: headers['References'] || headers['references'],
            date: headers['Date'] || headers['date'],
            deliveredTo: headers['Delivered-To'] || headers['delivered-to'],
            returnPath: headers['Return-Path'] || headers['return-path'],
            contentType: headers['Content-Type'] || headers['content-type'],
            mimeVersion: headers['MIME-Version'] || headers['mime-version']
          }
        }
        
        function parseEmailContent(content) {
          const lines = content.split('\\n')
          const headers = {}
          let bodyStart = 0
          
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            if (line.trim() === '') {
              bodyStart = i + 1
              break
            }
            
            const colonIndex = line.indexOf(':')
            if (colonIndex > 0) {
              const key = line.substring(0, colonIndex).trim()
              const value = line.substring(colonIndex + 1).trim()
              headers[key] = value
            }
          }
          
          const body = lines.slice(bodyStart).join('\\n')
          const metadata = extractMetadata(headers)
          
          return {
            headers,
            body,
            metadata,
            textContent: body.includes('<html>') ? htmlToText(body) : body
          }
        }
        
        self.onmessage = function(e) {
          const { id, type, data } = e.data
          
          try {
            let result
            
            switch (type) {
              case 'parse':
                result = parseEmailContent(data.content)
                break
              case 'extract-metadata':
                result = extractMetadata(data.headers)
                break
              case 'convert-html':
                result = htmlToText(data.html)
                break
              default:
                throw new Error('Unknown parse type: ' + type)
            }
            
            self.postMessage({ id, success: true, result })
          } catch (error) {
            self.postMessage({ id, success: false, error: error.message })
          }
        }
        `
      ], { type: 'application/javascript' })

      workerRef.current = new Worker(URL.createObjectURL(workerBlob))

      workerRef.current.onmessage = (e: MessageEvent<EmailParseResponse>) => {
        const { id, success, result, error } = e.data
        const pending = pendingRequests.current.get(id)
        
        if (pending) {
          clearTimeout(pending.timeout)
          pendingRequests.current.delete(id)
          
          if (success) {
            pending.resolve(result)
          } else {
            pending.reject(new Error(error || 'Worker processing failed'))
          }
        }
      }

      workerRef.current.onerror = (error) => {
        console.error('Worker error:', error)
        // Reject all pending requests
        pendingRequests.current.forEach(({ reject, timeout }) => {
          clearTimeout(timeout)
          reject(new Error('Worker error'))
        })
        pendingRequests.current.clear()
      }

    } catch (error) {
      console.error('Failed to create worker:', error)
    }

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate()
        workerRef.current = null
      }
      // Clear all pending requests
      currentPendingRequests.forEach(({ reject, timeout }) => {
        clearTimeout(timeout)
        reject(new Error('Worker terminated'))
      })
      currentPendingRequests.clear()
    }
  }, [isWorkerSupported])

  // Generic worker request function
  const sendWorkerRequest = useCallback((type: string, data: any, timeoutMs = 10000): Promise<any> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error('Worker not available'))
        return
      }

      const id = `req_${++requestIdCounter.current}`
      
      const timeout = setTimeout(() => {
        pendingRequests.current.delete(id)
        reject(new Error('Worker request timeout'))
      }, timeoutMs)

      pendingRequests.current.set(id, { resolve, reject, timeout })

      const request: EmailParseRequest = { id, type: type as any, data }
      workerRef.current.postMessage(request)
    })
  }, [])

  // Parse email content
  const parseEmail = useCallback(async (content: string): Promise<any> => {
    if (!isWorkerSupported || !workerRef.current) {
      // Fallback to main thread parsing
      return parseEmailOnMainThread(content)
    }

    try {
      return await sendWorkerRequest('parse', { content })
    } catch (error) {
      console.warn('Worker parsing failed, falling back to main thread:', error)
      return parseEmailOnMainThread(content)
    }
  }, [isWorkerSupported, sendWorkerRequest])

  // Convert HTML to text
  const convertHtmlToText = useCallback(async (html: string): Promise<string> => {
    if (!isWorkerSupported || !workerRef.current) {
      // Fallback to main thread conversion
      return htmlToTextOnMainThread(html)
    }

    try {
      return await sendWorkerRequest('convert-html', { html })
    } catch (error) {
      console.warn('Worker HTML conversion failed, falling back to main thread:', error)
      return htmlToTextOnMainThread(html)
    }
  }, [isWorkerSupported, sendWorkerRequest])

  // Extract metadata
  const extractMetadata = useCallback(async (headers: Record<string, string>): Promise<any> => {
    if (!isWorkerSupported || !workerRef.current) {
      // Fallback to main thread extraction
      return extractMetadataOnMainThread(headers)
    }

    try {
      return await sendWorkerRequest('extract-metadata', { headers })
    } catch (error) {
      console.warn('Worker metadata extraction failed, falling back to main thread:', error)
      return extractMetadataOnMainThread(headers)
    }
  }, [isWorkerSupported, sendWorkerRequest])

  // Register service worker
  const registerServiceWorker = useCallback(async (): Promise<boolean> => {
    if (!isServiceWorkerSupported) {
      console.warn('Service Worker not supported')
      return false
    }

    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      })

      console.log('Service Worker registered:', registration)

      // Listen for messages from service worker
      navigator.serviceWorker.addEventListener('message', (event) => {
        console.log('Message from Service Worker:', event.data)
        
        if (event.data.type === 'BACKGROUND_SYNC_REQUEST') {
          // Handle background sync request
          window.dispatchEvent(new CustomEvent('gmail-background-sync', {
            detail: event.data
          }))
        }
      })

      // Request notification permission
      if ('Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission()
      }

      return true
    } catch (error) {
      console.error('Service Worker registration failed:', error)
      return false
    }
  }, [isServiceWorkerSupported])

  return {
    parseEmail,
    convertHtmlToText,
    extractMetadata,
    isWorkerSupported,
    isServiceWorkerSupported,
    registerServiceWorker
  }
}

// Fallback functions for main thread processing
function parseEmailOnMainThread(content: string) {
  const lines = content.split('\n')
  const headers: Record<string, string> = {}
  let bodyStart = 0
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim() === '') {
      bodyStart = i + 1
      break
    }
    
    const colonIndex = line.indexOf(':')
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim()
      const value = line.substring(colonIndex + 1).trim()
      headers[key] = value
    }
  }
  
  const body = lines.slice(bodyStart).join('\n')
  const metadata = extractMetadataOnMainThread(headers)
  
  return {
    headers,
    body,
    metadata,
    textContent: body.includes('<html>') ? htmlToTextOnMainThread(body) : body
  }
}

function htmlToTextOnMainThread(html: string): string {
  if (typeof document === 'undefined') {
    // Server-side fallback
    return html.replace(/<[^>]*>/g, '')
  }
  
  const tempDiv = document.createElement('div')
  tempDiv.innerHTML = html
  
  const scripts = tempDiv.querySelectorAll('script, style')
  scripts.forEach(el => el.remove())
  
  return tempDiv.textContent || tempDiv.innerText || ''
}

function extractMetadataOnMainThread(headers: Record<string, string>) {
  return {
    messageId: headers['Message-ID'] || headers['message-id'],
    inReplyTo: headers['In-Reply-To'] || headers['in-reply-to'],
    references: headers['References'] || headers['references'],
    date: headers['Date'] || headers['date'],
    deliveredTo: headers['Delivered-To'] || headers['delivered-to'],
    returnPath: headers['Return-Path'] || headers['return-path'],
    contentType: headers['Content-Type'] || headers['content-type'],
    mimeVersion: headers['MIME-Version'] || headers['mime-version']
  }
}