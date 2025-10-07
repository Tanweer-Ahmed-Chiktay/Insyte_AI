import { useEffect, useRef, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import useEmailStore from '@/lib/email-store'
import { useToast } from '@/components/ui/use-toast'

interface WebSocketMessage {
  type: string
  payload: any
  timestamp: number
}

interface UseWebSocketReturn {
  isConnected: boolean
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error'
  sendMessage: (message: WebSocketMessage) => void
  reconnect: () => void
}

export function useWebSocket(): UseWebSocketReturn {
  const { data: session } = useSession()
  const { toast } = useToast()
  const { addEmails, updateEmail, removeEmail } = useEmailStore()
  
  const ws = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttempts = useRef(0)
  const maxReconnectAttempts = 5
  
  const [isConnected, setIsConnected] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected')

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message: WebSocketMessage = JSON.parse(event.data)
      
      switch (message.type) {
        case 'connected':
          console.log('[WebSocket] Connected successfully')
          setIsConnected(true)
          setConnectionStatus('connected')
          reconnectAttempts.current = 0
          break
          
        case 'email:new':
          // Optimistically add new email to store
          const newEmail = message.payload
          if (newEmail) {
            // Add to inbox and other relevant categories
            addEmails('inbox', [newEmail])
            if (newEmail.isStarred) addEmails('starred', [newEmail])
            if (newEmail.isImportant) addEmails('important', [newEmail])
            
            toast({
              title: 'New Email',
              description: `From: ${newEmail.from}`,
              duration: 3000
            })
          }
          break
          
        case 'email:updated':
          // Update existing email
          const { emailId, updates } = message.payload
          if (emailId && updates) {
            updateEmail(emailId, updates)
          }
          break
          
        case 'email:deleted':
          // Remove email from store
          const deletedEmailId = message.payload.emailId
          if (deletedEmailId) {
            removeEmail(deletedEmailId)
          }
          break
          
        case 'gmail-push-notification':
          // Handle Gmail push notifications
          if (message.payload?.action === 'email_sent') {
            // Email was sent successfully
            toast({
              title: 'Email Sent Successfully',
              description: `Your email \"${message.payload.email?.subject || 'Untitled'}\" has been sent`,
              duration: 3000
            })
            
            // Add to sent emails if email data is available
            if (message.payload.email) {
              addEmails('sent', [message.payload.email])
            }
          } else {
            // General Gmail webhook notification
            toast({
              title: 'New Email Activity',
              description: `Gmail changes detected for ${message.payload?.notification?.emailAddress || message.payload?.emailAddress || 'your account'}`,
              duration: 3000
            })
          }
          break
          
        case 'gmail-sync-update':
          // Handle Gmail sync updates from Pub/Sub
          const changes = message.payload?.changes || {}
          const newMessages = changes.newMessages || 0
          const deletedMessages = changes.deletedMessages || 0
          
          if (newMessages > 0 || deletedMessages > 0) {
            toast({
              title: 'Gmail Sync Update',
              description: `${newMessages} new email(s), ${deletedMessages} deleted`,
              duration: 3000
            })
          }
          break
          
        case 'sync:status':
          // Handle sync status updates
          const { status, details } = message.payload
          if (status === 'error') {
            toast({
              title: 'Sync Error',
              description: details?.message || 'Email sync failed',
              variant: 'destructive',
              duration: 5000
            })
          }
          break
          
        case 'heartbeat':
        case 'pong':
          // Keep connection alive
          break
          
        default:
          console.log('[WebSocket] Unknown message type:', message.type)
      }
    } catch (error) {
      console.error('[WebSocket] Error parsing message:', error)
    }
  }, [addEmails, updateEmail, removeEmail, toast])

  const connect = useCallback(async () => {
    if (!session?.user?.email) {
      setConnectionStatus('disconnected')
      return
    }
    
    try {
      setConnectionStatus('connecting')
      
      // Get WebSocket connection details
      const response = await fetch('/api/ws')
      if (!response.ok) {
        // Handle 503 Service Unavailable (WebSocket not supported in serverless)
        if (response.status === 503) {
          try {
            const errorData = await response.json()
            if (errorData.fallbackMode) {
              console.log('[WebSocket] WebSocket not supported in serverless environment, falling back to polling')
              setConnectionStatus('disconnected')
              return
            }
          } catch (parseError) {
            // If we can't parse the error response, continue with generic error handling
          }
        }
        console.warn('WebSocket API not available, falling back to polling')
        setConnectionStatus('disconnected')
        return
      }
      
      const { token, wsUrl } = await response.json()
      
      // Create WebSocket connection
      ws.current = new WebSocket(wsUrl)
      
      ws.current.onopen = () => {
        console.log('[WebSocket] Connection opened')
        setConnectionStatus('connected')
        setIsConnected(true)
        reconnectAttempts.current = 0
        
        // Subscribe to email topics - send directly since connection is just opened
        if (ws.current?.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify({
            type: 'subscribe',
            payload: { topics: ['emails', 'sync', 'notifications'] },
            timestamp: Date.now()
          }))
        }
      }
      
      ws.current.onmessage = handleMessage
      
      ws.current.onclose = (event) => {
        console.log('[WebSocket] Connection closed:', event.code, event.reason)
        setIsConnected(false)
        setConnectionStatus('disconnected')
        
        // Attempt to reconnect if not a normal closure
        if (event.code !== 1000 && reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000)
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++
            connect()
          }, delay)
        }
      }
      
      ws.current.onerror = (error) => {
        console.error('[WebSocket] Connection error:', error)
        setConnectionStatus('error')
        setIsConnected(false)
      }
      
    } catch (error) {
      console.error('[WebSocket] Failed to connect:', error)
      setConnectionStatus('error')
      setIsConnected(false)
    }
  }, [session?.user?.email, handleMessage])

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    
    if (ws.current) {
      ws.current.close(1000, 'User disconnect')
      ws.current = null
    }
    
    setIsConnected(false)
    setConnectionStatus('disconnected')
  }, [])

  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      try {
        ws.current.send(JSON.stringify(message))
      } catch (error) {
        console.error('[WebSocket] Error sending message:', error)
      }
    } else {
      console.warn('[WebSocket] Cannot send message - connection state:', ws.current?.readyState)
    }
  }, [])

  const reconnect = useCallback(() => {
    disconnect()
    setTimeout(connect, 1000)
  }, [connect, disconnect])

  // Connect when session is available
  useEffect(() => {
    if (session?.user?.email) {
      // Add a small delay to ensure server is ready
      const timer = setTimeout(() => {
        connect()
      }, 1000)
      
      return () => {
        clearTimeout(timer)
        disconnect()
      }
    }
    
    return disconnect
  }, [session?.user?.email, connect, disconnect])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [disconnect])

  return {
    isConnected,
    connectionStatus,
    sendMessage,
    reconnect
  }
}