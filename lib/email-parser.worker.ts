// Web Worker for parsing email content off the main thread
// This prevents UI blocking during heavy email processing

interface EmailParseRequest {
  id: string
  type: 'parse' | 'extract-metadata' | 'convert-html'
  data: {
    content?: string
    html?: string
    headers?: Record<string, string>
  }
}

interface EmailParseResponse {
  id: string
  success: boolean
  result?: any
  error?: string
}

// HTML to text conversion
function htmlToText(html: string): string {
  // Create a temporary div to parse HTML
  const tempDiv = document.createElement('div')
  tempDiv.innerHTML = html
  
  // Remove script and style elements
  const scripts = tempDiv.querySelectorAll('script, style')
  scripts.forEach(el => el.remove())
  
  // Get text content and clean up whitespace
  return tempDiv.textContent || tempDiv.innerText || ''
}

// Extract email metadata from headers
function extractMetadata(headers: Record<string, string>) {
  const metadata = {
    messageId: headers['Message-ID'] || headers['message-id'],
    inReplyTo: headers['In-Reply-To'] || headers['in-reply-to'],
    references: headers['References'] || headers['references'],
    date: headers['Date'] || headers['date'],
    deliveredTo: headers['Delivered-To'] || headers['delivered-to'],
    returnPath: headers['Return-Path'] || headers['return-path'],
    receivedSpf: headers['Received-SPF'] || headers['received-spf'],
    dkimSignature: headers['DKIM-Signature'] || headers['dkim-signature'],
    contentType: headers['Content-Type'] || headers['content-type'],
    contentEncoding: headers['Content-Transfer-Encoding'] || headers['content-transfer-encoding'],
    mimeVersion: headers['MIME-Version'] || headers['mime-version'],
    userAgent: headers['User-Agent'] || headers['user-agent'],
    xMailer: headers['X-Mailer'] || headers['x-mailer'],
    priority: headers['X-Priority'] || headers['x-priority'],
    importance: headers['Importance'] || headers['importance']
  }
  
  return metadata
}

// Parse email content and extract useful information
function parseEmailContent(content: string) {
  try {
    // Basic email parsing - in a real implementation, you'd use a proper email parser
    const lines = content.split('\n')
    const headers: Record<string, string> = {}
    let bodyStart = 0
    
    // Parse headers
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
    
    // Extract body
    const body = lines.slice(bodyStart).join('\n')
    
    // Extract metadata
    const metadata = extractMetadata(headers)
    
    return {
      headers,
      body,
      metadata,
      textContent: body.includes('<html>') ? htmlToText(body) : body
    }
  } catch (error) {
    throw new Error(`Failed to parse email content: ${error}`)
  }
}

// Handle messages from main thread
self.onmessage = function(e: MessageEvent<EmailParseRequest>) {
  const { id, type, data } = e.data
  
  try {
    let result: any
    
    switch (type) {
      case 'parse':
        if (!data.content) {
          throw new Error('Content is required for parsing')
        }
        result = parseEmailContent(data.content)
        break
        
      case 'extract-metadata':
        if (!data.headers) {
          throw new Error('Headers are required for metadata extraction')
        }
        result = extractMetadata(data.headers)
        break
        
      case 'convert-html':
        if (!data.html) {
          throw new Error('HTML is required for conversion')
        }
        result = htmlToText(data.html)
        break
        
      default:
        throw new Error(`Unknown parse type: ${type}`)
    }
    
    const response: EmailParseResponse = {
      id,
      success: true,
      result
    }
    
    self.postMessage(response)
  } catch (error) {
    const response: EmailParseResponse = {
      id,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
    
    self.postMessage(response)
  }
}

// Export types for TypeScript
export type { EmailParseRequest, EmailParseResponse }