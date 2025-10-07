import { useEffect, useRef, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import PusherClient from 'pusher-js'
import { PUSHER_CHANNELS, PUSHER_EVENTS, createPusherClient } from '@/lib/pusher-config'

interface EmailUpdateData {
  category: string
  action: 'added' | 'updated' | 'deleted' | 'moved' | 'starred' | 'unstarred' | 'read' | 'unread'
  emailIds: string[]
  count?: number
  fromCategory?: string
  toCategory?: string
}

interface SyncStatusData {
  category: string
  status: 'started' | 'completed' | 'failed'
  progress?: number
  message?: string
}

interface UsePusherOptions {
  onEmailUpdate?: (data: EmailUpdateData) => void
  onSyncStatus?: (data: SyncStatusData) => void
  onNewEmail?: (email: any) => void
  onEmailDeleted?: (emailId: string) => void
  onCalendarEvent?: (event: any) => void
  onError?: (error: string) => void
  debug?: boolean
}

interface PusherState {
  isConnected: boolean
  isConnecting: boolean
  error: string | null
  subscribedChannels: string[]
}

export function usePusher(options: UsePusherOptions = {}) {
  const { data: session, status } = useSession()
  const pusherRef = useRef<PusherClient | null>(null)
  const channelsRef = useRef<Set<string>>(new Set())
  const isInitializedRef = useRef(false)

  const {
    onEmailUpdate,
    onSyncStatus,
    onNewEmail,
    onEmailDeleted,
    onCalendarEvent,
    onError,
    debug = false
  } = options

  // Use refs to store callback functions to prevent recreation of handlers
  const callbacksRef = useRef({
    onEmailUpdate,
    onSyncStatus,
    onNewEmail,
    onEmailDeleted,
    onCalendarEvent,
    onError
  })
  
  const debugRef = useRef(debug)
  
  // Update refs when callbacks or debug flag change
  callbacksRef.current = {
    onEmailUpdate,
    onSyncStatus,
    onNewEmail,
    onEmailDeleted,
    onCalendarEvent,
    onError
  }
  
  debugRef.current = debug

  const [state, setState] = useState<PusherState>({
    isConnected: false,
    isConnecting: false,
    error: null,
    subscribedChannels: []
  })

  const log = useCallback((message: string, ...args: any[]) => {
    if (debugRef.current) {
      console.log(`[Pusher] ${message}`, ...args)
    }
  }, [])

  const updateState = useCallback((updates: Partial<PusherState>) => {
    setState(prev => ({ ...prev, ...updates }))
  }, [])

  const initializePusher = useCallback(() => {
    if (!session?.user?.email || isInitializedRef.current) {
      return
    }

    try {
      log('Initializing Pusher client...')
      
      const pusher = createPusherClient()

      pusherRef.current = pusher
      isInitializedRef.current = true

      // Connection event handlers
      pusher.connection.bind('connected', () => {
        log('Connected to Pusher')
        updateState({ 
          isConnected: true, 
          isConnecting: false,
          error: null 
        })
      })

      pusher.connection.bind('connecting', () => {
        log('Connecting to Pusher...')
        updateState({ isConnecting: true, error: null })
      })

      pusher.connection.bind('disconnected', () => {
        log('Disconnected from Pusher')
        updateState({ 
          isConnected: false, 
          isConnecting: false 
        })
      })

      pusher.connection.bind('error', (error: any) => {
        console.error('Pusher connection error:', error)
        console.error('Pusher error details:', {
          type: error?.type,
          error: error?.error,
          data: error?.data,
          status: error?.status,
          message: error?.error?.message || error?.message
        })
        
        const errorMessage = error?.error?.message || error?.message || 'Pusher connection error'
        updateState({ 
          error: errorMessage,
          isConnecting: false 
        })
        callbacksRef.current.onError?.(errorMessage)
      })

      // Subscribe to user-specific channel
      const userChannel = `user-${session.user.email.replace('@', '-').replace('.', '-')}`
      const channel = pusher.subscribe(userChannel)
      channelsRef.current.add(userChannel)
      
      log('Subscribed to user channel:', userChannel)

      // Bind event handlers
      channel.bind(PUSHER_EVENTS.EMAIL_UPDATE, (data: EmailUpdateData) => {
        log('Received email update:', data)
        callbacksRef.current.onEmailUpdate?.(data)
        
        // Dispatch custom event for UI components
        if (data) {
          window.dispatchEvent(new CustomEvent('email-list-refresh', {
            detail: { 
              category: data.category || 'inbox', 
              action: data.action || 'added'
            }
          }))
        }
      })

      channel.bind(PUSHER_EVENTS.EMAIL_NEW, (email: any) => {
        log('🔔 Received new email via Pusher:', email)
        console.log('📧 New email details:', {
          id: email?.id,
          subject: email?.subject,
          from: email?.from,
          hasCallback: !!callbacksRef.current.onNewEmail
        })
        
        callbacksRef.current.onNewEmail?.(email)
        
        // Dispatch custom event for UI components
        if (email) {
          console.log('📤 Dispatching new-email-received event')
          window.dispatchEvent(new CustomEvent('new-email-received', {
            detail: email
          }))
          
          // Also trigger email list refresh for appropriate categories
          const categories = ['inbox']
          
          if (email.isStarred) categories.push('starred')
          if (email.isImportant) categories.push('important')
          if (!email.isRead) categories.push('unread')
          
          console.log('🔄 Triggering refresh for categories:', categories)
          categories.forEach(category => {
            window.dispatchEvent(new CustomEvent('email-list-refresh', {
              detail: { category, action: 'added' }
            }))
          })
        }
      })

      channel.bind(PUSHER_EVENTS.EMAIL_DELETED, (data: { emailId: string }) => {
        log('Received email deleted:', data)
        callbacksRef.current.onEmailDeleted?.(data.emailId)
      })

      channel.bind(PUSHER_EVENTS.SYNC_STATUS, (data: SyncStatusData) => {
        log('Received sync status:', data)
        callbacksRef.current.onSyncStatus?.(data)
      })

      channel.bind(PUSHER_EVENTS.GMAIL_PUSH_NOTIFICATION, (data: any) => {
        log('Received Gmail push notification:', data)
        try {
          const newIds = data?.changes?.newMessageIds 
            || data?.newMessageIds 
            || []

          if (newIds.length > 0) {
            log(`Processing ${newIds.length} new message IDs from Gmail push`)
            callbacksRef.current.onEmailUpdate?.({
              category: 'inbox',
              action: 'added',
              emailIds: newIds,
              count: newIds.length
            })
          }
        } catch (error) {
          console.error('Error processing Gmail push notification:', error)
        }
      })

      updateState({ 
        subscribedChannels: Array.from(channelsRef.current) 
      })

    } catch (error) {
      console.error('Failed to initialize Pusher:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to initialize Pusher'
      updateState({ 
        error: errorMessage,
        isConnecting: false 
      })
      callbacksRef.current.onError?.(errorMessage)
    }
  }, [session, log, updateState])

  const disconnect = useCallback(() => {
    if (pusherRef.current) {
      log('Disconnecting from Pusher')
      
      // Unsubscribe from all channels
      channelsRef.current.forEach(channelName => {
        pusherRef.current?.unsubscribe(channelName)
      })
      channelsRef.current.clear()
      
      // Disconnect
      pusherRef.current.disconnect()
      pusherRef.current = null
      isInitializedRef.current = false
      
      updateState({
        isConnected: false,
        isConnecting: false,
        subscribedChannels: []
      })
    }
  }, [log, updateState])

  // Initialize when session is available
  useEffect(() => {
    if (status === 'authenticated' && session) {
      initializePusher()
    } else if (status === 'unauthenticated') {
      disconnect()
    }
  }, [status, session, initializePusher, disconnect])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [disconnect])

  return {
    ...state,
    disconnect,
    reconnect: initializePusher
  }
}