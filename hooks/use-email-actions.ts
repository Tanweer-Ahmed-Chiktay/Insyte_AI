import { useCallback, useEffect, useRef } from 'react'
import { useToast } from '@/components/ui/use-toast'
import useEmailStore from '@/lib/email-store'

interface EmailActionOptions {
  optimistic?: boolean
  showToast?: boolean
}

interface EmailActionResult {
  success: boolean
  jobId?: string
  error?: string
}

export function useEmailActions() {
  const { toast } = useToast()
  const {
    getEmails,
    setEmails,
    updateEmail,
    removeEmail,
    moveEmailToCategory
  } = useEmailStore()
  
  // Track optimistic updates for rollback
  const optimisticUpdates = useRef(new Map<string, {
    action: string
    emailIds: string[]
    originalState: any
    timestamp: number
  }>())

  // WebSocket connection for real-time updates
  useEffect(() => {
    if (typeof window === 'undefined') return

    let ws: WebSocket | null = null
    
    const connectWebSocket = () => {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const wsUrl = `${protocol}//${window.location.host}/api/websocket`
        ws = new WebSocket(wsUrl)
        
        ws.onopen = () => {
          console.log('[EmailActions] WebSocket connected')
        }
        
        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data)
            handleWebSocketMessage(message)
          } catch (error) {
            console.error('[EmailActions] Failed to parse WebSocket message:', error)
          }
        }
        
        ws.onclose = () => {
          console.log('[EmailActions] WebSocket disconnected, attempting to reconnect...')
          setTimeout(connectWebSocket, 3000)
        }
        
        ws.onerror = (error) => {
          console.error('[EmailActions] WebSocket error:', error)
        }
      } catch (error) {
        console.error('[EmailActions] Failed to connect WebSocket:', error)
        setTimeout(connectWebSocket, 5000)
      }
    }
    
    connectWebSocket()
    
    return () => {
      if (ws) {
        ws.close()
      }
    }
  }, [])

  // Handle WebSocket messages for real-time updates
  const handleWebSocketMessage = useCallback((message: any) => {
    if (message.type === 'email-update') {
      const { data } = message
      
      if (data.optimistic) {
        // This is our own optimistic update confirmation
        return
      }
      
      // Handle confirmed updates from server
      if (data.jobId && optimisticUpdates.current.has(data.jobId)) {
        // Remove optimistic update tracking
        optimisticUpdates.current.delete(data.jobId)
        
        toast({
          title: "Action completed",
          description: `${data.action} completed successfully`,
          duration: 2000
        })
      }
      
      // Apply real updates to the store
      handleEmailUpdate(data)
    } else if (message.type === 'error') {
      // Handle action errors and rollback optimistic updates
      if (message.jobId && optimisticUpdates.current.has(message.jobId)) {
        const update = optimisticUpdates.current.get(message.jobId)!
        rollbackOptimisticUpdate(update)
        optimisticUpdates.current.delete(message.jobId)
        
        toast({
          title: "Action failed",
          description: message.data.error || "Please try again",
          variant: "destructive",
          duration: 4000
        })
      }
    }
  }, [toast])

  // Handle email updates from WebSocket
  const handleEmailUpdate = useCallback((data: any) => {
    const { action, emailIds, fromCategory, toCategory } = data
    
    switch (action) {
      case 'archive':
        emailIds.forEach((id: string) => {
          moveEmailToCategory(id, fromCategory || 'inbox', 'archived')
        })
        break
      case 'delete':
        emailIds.forEach((id: string) => {
          moveEmailToCategory(id, fromCategory || 'inbox', 'trash')
        })
        break
      case 'star':
      case 'unstar':
        emailIds.forEach((id: string) => {
          updateEmail(id, {
            isStarred: action === 'star'
          })
        })
        break
      case 'markRead':
      case 'markUnread':
        emailIds.forEach((id: string) => {
          updateEmail(id, {
            isRead: action === 'markRead'
          })
        })
        break
      case 'move':
        if (toCategory) {
          emailIds.forEach((id: string) => {
            moveEmailToCategory(id, toCategory, 'inbox')
          })
        }
        break
    }
  }, [updateEmail, moveEmailToCategory])

  // Rollback optimistic updates
  const rollbackOptimisticUpdate = useCallback((update: any) => {
    const { action, emailIds, originalState } = update
    
    // Restore original state based on action type
    switch (action) {
      case 'archive':
        emailIds.forEach((id: string, index: number) => {
          if (update.originalState[index]) {
            moveEmailToCategory(id, 'inbox', update.originalState[index].category)
          }
        })
        break
      case 'delete':
        emailIds.forEach((id: string, index: number) => {
          if (update.originalState[index]) {
            moveEmailToCategory(id, update.originalState[index].category, 'deleted')
          }
        })
        break
      case 'star':
      case 'unstar':
        emailIds.forEach((id: string, index: number) => {
          if (update.originalState[index]) {
            updateEmail(id, {
              isStarred: update.originalState[index].isStarred
            })
          }
        })
        break
      case 'markRead':
      case 'markUnread':
        emailIds.forEach((id: string, index: number) => {
          if (update.originalState[index]) {
            updateEmail(id, {
              isRead: update.originalState[index].isRead
            })
          }
        })
        break
    }
  }, [updateEmail, moveEmailToCategory])

  // Perform email action with optimistic updates
  const performEmailAction = useCallback(async (
    action: string,
    emailIds: string[],
    fromCategory?: string,
    toCategory?: string,
    options: EmailActionOptions = {}
  ): Promise<EmailActionResult> => {
    const { optimistic = true, showToast = true } = options
    
    // Store original state for potential rollback
     const originalState = emailIds.map(id => {
       const categories = ['inbox', 'sent', 'starred', 'important', 'trash', 'spam', 'archived']
       for (const cat of categories) {
         const emails = getEmails(cat)
         const email = emails.find(e => e.id === id)
         if (email) {
           return {
             category: cat,
             isStarred: email.isStarred,
             isRead: email.isRead,
             email
           }
         }
       }
       return null
     }).filter(Boolean)
     
     try {

      // Apply optimistic update immediately
      if (optimistic) {
        handleEmailUpdate({ action, emailIds, fromCategory, toCategory })
        
        if (showToast) {
          toast({
            title: `${action} in progress...`,
            description: `Processing ${emailIds.length} email(s)`,
            duration: 2000
          })
        }
      }

      // Send request to server
      const response = await fetch('/api/gmail/actions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action,
          emailIds,
          fromCategory,
          toCategory
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Action failed')
      }

      // Track optimistic update for potential rollback
      if (optimistic && result.jobId) {
        optimisticUpdates.current.set(result.jobId, {
          action,
          emailIds,
          originalState,
          timestamp: Date.now()
        })
        
        // Auto-cleanup after 30 seconds
        setTimeout(() => {
          optimisticUpdates.current.delete(result.jobId)
        }, 30000)
      }

      return {
        success: true,
        jobId: result.jobId
      }
    } catch (error) {
      // Rollback optimistic update on error
      if (optimistic && originalState.length > 0) {
        rollbackOptimisticUpdate({
          action,
          emailIds,
          originalState: originalState
        })
      }
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      if (showToast) {
        toast({
          title: "Action failed",
          description: errorMessage,
          variant: "destructive",
          duration: 4000
        })
      }
      
      return {
        success: false,
        error: errorMessage
      }
    }
  }, [getEmails, handleEmailUpdate, toast, rollbackOptimisticUpdate, optimisticUpdates])

  // Specific action functions
  const archiveEmails = useCallback((emailIds: string[], options?: EmailActionOptions) => {
    return performEmailAction('archive', emailIds, 'inbox', 'archived', options)
  }, [performEmailAction])

  const deleteEmails = useCallback((emailIds: string[], fromCategory = 'inbox', options?: EmailActionOptions) => {
    return performEmailAction('delete', emailIds, fromCategory, 'trash', options)
  }, [performEmailAction])

  const starEmails = useCallback((emailIds: string[], category = 'inbox', options?: EmailActionOptions) => {
    return performEmailAction('star', emailIds, category, undefined, options)
  }, [performEmailAction])

  const unstarEmails = useCallback((emailIds: string[], category = 'inbox', options?: EmailActionOptions) => {
    return performEmailAction('unstar', emailIds, category, undefined, options)
  }, [performEmailAction])

  const markAsRead = useCallback((emailIds: string[], category = 'inbox', options?: EmailActionOptions) => {
    return performEmailAction('markRead', emailIds, category, undefined, options)
  }, [performEmailAction])

  const markAsUnread = useCallback((emailIds: string[], category = 'inbox', options?: EmailActionOptions) => {
    return performEmailAction('markUnread', emailIds, category, undefined, options)
  }, [performEmailAction])

  const moveEmails = useCallback((emailIds: string[], fromCategory: string, toCategory: string, options?: EmailActionOptions) => {
    return performEmailAction('move', emailIds, fromCategory, toCategory, options)
  }, [performEmailAction])

  return {
    // Action functions
    archiveEmails,
    deleteEmails,
    starEmails,
    unstarEmails,
    markAsRead,
    markAsUnread,
    moveEmails,
    
    // Generic action function
    performEmailAction,
    
    // Status
    hasPendingActions: optimisticUpdates.current.size > 0
  }
}