// Optimistic UI Updates Hook - Instant feedback for user actions
// Provides immediate UI updates while handling server confirmation and rollback

import React, { useState, useCallback, useRef } from 'react'
// import { toast } from 'sonner' // Commented out - using console.log for now
const toast = {
  loading: (message: string, options?: any) => console.log(`Loading: ${message}`),
  success: (message: string, options?: any) => console.log(`Success: ${message}`),
  error: (message: string, options?: any) => console.log(`Error: ${message}`),
  dismiss: (id: string) => console.log(`Dismissed: ${id}`)
}

export interface OptimisticAction {
  id: string
  type: string
  payload: any
  timestamp: number
  status: 'pending' | 'confirmed' | 'failed'
  rollback?: () => void
}

export interface OptimisticState<T> {
  data: T
  pendingActions: OptimisticAction[]
  isOptimistic: boolean
}

export interface UseOptimisticUpdatesOptions {
  onError?: (error: Error, action: OptimisticAction) => void
  onSuccess?: (action: OptimisticAction) => void
  maxRetries?: number
  retryDelay?: number
  showToasts?: boolean
}

/**
 * Hook for managing optimistic UI updates with automatic rollback on failure
 */
export function useOptimisticUpdates<T>(
  initialData: T,
  options: UseOptimisticUpdatesOptions = {}
) {
  const {
    onError,
    onSuccess,
    maxRetries = 3,
    retryDelay = 1000,
    showToasts = true
  } = options

  const [state, setState] = useState<OptimisticState<T>>({
    data: initialData,
    pendingActions: [],
    isOptimistic: false
  })

  const retryCountRef = useRef<Map<string, number>>(new Map())
  const timeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map())

  /**
   * Apply an optimistic update immediately
   */
  const applyOptimisticUpdate = useCallback(
    <P>(
      type: string,
      payload: P,
      updater: (current: T, payload: P) => T,
      rollback?: () => void
    ): string => {
      const actionId = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      
      const action: OptimisticAction = {
        id: actionId,
        type,
        payload,
        timestamp: Date.now(),
        status: 'pending',
        rollback
      }

      setState(prev => {
        const newData = updater(prev.data, payload)
        return {
          data: newData,
          pendingActions: [...prev.pendingActions, action],
          isOptimistic: true
        }
      })

      if (showToasts) {
        toast.loading(`${type} in progress...`, { id: actionId })
      }

      return actionId
    },
    [showToasts]
  )

  /**
   * Confirm an optimistic action (remove from pending)
   */
  const confirmAction = useCallback(
    (actionId: string, serverData?: Partial<T>) => {
      setState(prev => {
        const action = prev.pendingActions.find(a => a.id === actionId)
        if (!action) return prev

        const updatedActions = prev.pendingActions.map(a =>
          a.id === actionId ? { ...a, status: 'confirmed' as const } : a
        )

        // Apply server data if provided
        const newData = serverData ? { ...prev.data, ...serverData } : prev.data

        return {
          data: newData,
          pendingActions: updatedActions.filter(a => a.status === 'pending'),
          isOptimistic: updatedActions.some(a => a.status === 'pending')
        }
      })

      // Clear retry count and timeout
      retryCountRef.current.delete(actionId)
      const timeout = timeoutRef.current.get(actionId)
      if (timeout) {
        clearTimeout(timeout)
        timeoutRef.current.delete(actionId)
      }

      if (showToasts) {
        toast.success('Action completed', { id: actionId })
      }

      const action = state.pendingActions.find(a => a.id === actionId)
      if (action && onSuccess) {
        onSuccess(action)
      }
    },
    [state.pendingActions, onSuccess, showToasts]
  )

  /**
   * Fail an optimistic action (rollback and retry if configured)
   */
  const failAction = useCallback(
    (actionId: string, error: Error, shouldRetry = true) => {
      const action = state.pendingActions.find(a => a.id === actionId)
      if (!action) return

      const currentRetries = retryCountRef.current.get(actionId) || 0
      
      if (shouldRetry && currentRetries < maxRetries) {
        // Retry the action
        retryCountRef.current.set(actionId, currentRetries + 1)
        
        const timeout = setTimeout(() => {
          // Re-trigger the action (this would need to be handled by the caller)
          console.log(`Retrying action ${actionId} (attempt ${currentRetries + 1})`)
        }, retryDelay * Math.pow(2, currentRetries)) // Exponential backoff
        
        timeoutRef.current.set(actionId, timeout)
        
        if (showToasts) {
          toast.error(`Action failed, retrying... (${currentRetries + 1}/${maxRetries})`, { id: actionId })
        }
        return
      }

      // Rollback the optimistic update
      setState(prev => {
        const updatedActions = prev.pendingActions.filter(a => a.id !== actionId)
        
        // If there's a custom rollback function, use it
        if (action.rollback) {
          action.rollback()
        }
        
        return {
          data: prev.data, // Keep current data, rollback should be handled by caller
          pendingActions: updatedActions,
          isOptimistic: updatedActions.length > 0
        }
      })

      // Clear retry count and timeout
      retryCountRef.current.delete(actionId)
      const timeout = timeoutRef.current.get(actionId)
      if (timeout) {
        clearTimeout(timeout)
        timeoutRef.current.delete(actionId)
      }

      if (showToasts) {
        toast.error(`Action failed: ${error.message}`, { id: actionId })
      }

      if (onError) {
        onError(error, action)
      }
    },
    [state.pendingActions, maxRetries, retryDelay, onError, showToasts]
  )

  /**
   * Cancel a pending optimistic action
   */
  const cancelAction = useCallback(
    (actionId: string) => {
      setState(prev => {
        const action = prev.pendingActions.find(a => a.id === actionId)
        if (!action) return prev

        const updatedActions = prev.pendingActions.filter(a => a.id !== actionId)
        
        // Execute rollback if available
        if (action.rollback) {
          action.rollback()
        }

        return {
          data: prev.data,
          pendingActions: updatedActions,
          isOptimistic: updatedActions.length > 0
        }
      })

      // Clear retry count and timeout
      retryCountRef.current.delete(actionId)
      const timeout = timeoutRef.current.get(actionId)
      if (timeout) {
        clearTimeout(timeout)
        timeoutRef.current.delete(actionId)
      }

      if (showToasts) {
        toast.dismiss(actionId)
      }
    },
    [showToasts]
  )

  /**
   * Clear all pending actions
   */
  const clearPendingActions = useCallback(() => {
    setState(prev => ({
      data: prev.data,
      pendingActions: [],
      isOptimistic: false
    }))

    // Clear all timeouts
    timeoutRef.current.forEach(timeout => clearTimeout(timeout))
    timeoutRef.current.clear()
    retryCountRef.current.clear()
  }, [])

  /**
   * Update the base data (from server or other source)
   */
  const updateData = useCallback((newData: T | ((prev: T) => T)) => {
    setState(prev => ({
      ...prev,
      data: typeof newData === 'function' ? (newData as (prev: T) => T)(prev.data) : newData
    }))
  }, [])

  /**
   * Get action by ID
   */
  const getAction = useCallback(
    (actionId: string) => state.pendingActions.find(a => a.id === actionId),
    [state.pendingActions]
  )

  /**
   * Check if a specific type of action is pending
   */
  const isActionPending = useCallback(
    (type: string) => state.pendingActions.some(a => a.type === type),
    [state.pendingActions]
  )

  return {
    data: state.data,
    pendingActions: state.pendingActions,
    isOptimistic: state.isOptimistic,
    applyOptimisticUpdate,
    confirmAction,
    failAction,
    cancelAction,
    clearPendingActions,
    updateData,
    getAction,
    isActionPending
  }
}

/**
 * Specialized hook for email operations with common optimistic updates
 */
export function useOptimisticEmailActions(initialEmails: any[] = []) {
  const {
    data: emails,
    applyOptimisticUpdate,
    confirmAction,
    failAction,
    updateData,
    isOptimistic,
    pendingActions
  } = useOptimisticUpdates(initialEmails, {
    showToasts: true,
    maxRetries: 2
  })

  /**
   * Mark email as read/unread optimistically
   */
  const markAsRead = useCallback(
    (emailId: string, isRead: boolean) => {
      const originalEmail = emails.find(e => e.id === emailId)
      if (!originalEmail) return null

      const actionId = applyOptimisticUpdate(
        isRead ? 'mark-read' : 'mark-unread',
        { emailId, isRead },
        (currentEmails, { emailId, isRead }) =>
          currentEmails.map(email =>
            email.id === emailId ? { ...email, isRead } : email
          ),
        () => {
          // Rollback function
          updateData(currentEmails =>
            currentEmails.map(email =>
              email.id === emailId ? { ...email, isRead: originalEmail.isRead } : email
            )
          )
        }
      )

      return actionId
    },
    [emails, applyOptimisticUpdate, updateData]
  )

  /**
   * Star/unstar email optimistically
   */
  const toggleStar = useCallback(
    (emailId: string, isStarred: boolean) => {
      const originalEmail = emails.find(e => e.id === emailId)
      if (!originalEmail) return null

      const actionId = applyOptimisticUpdate(
        isStarred ? 'star' : 'unstar',
        { emailId, isStarred },
        (currentEmails, { emailId, isStarred }) =>
          currentEmails.map(email =>
            email.id === emailId ? { ...email, isStarred } : email
          ),
        () => {
          // Rollback function
          updateData(currentEmails =>
            currentEmails.map(email =>
              email.id === emailId ? { ...email, isStarred: originalEmail.isStarred } : email
            )
          )
        }
      )

      return actionId
    },
    [emails, applyOptimisticUpdate, updateData]
  )

  /**
   * Delete email optimistically
   */
  const deleteEmail = useCallback(
    (emailId: string) => {
      const originalEmail = emails.find(e => e.id === emailId)
      if (!originalEmail) return null

      const actionId = applyOptimisticUpdate(
        'delete',
        { emailId },
        (currentEmails, { emailId }) =>
          currentEmails.filter(email => email.id !== emailId),
        () => {
          // Rollback function - restore the email
          updateData(currentEmails => {
            const emailExists = currentEmails.some(e => e.id === emailId)
            if (!emailExists) {
              return [...currentEmails, originalEmail].sort((a, b) => 
                new Date(b.date).getTime() - new Date(a.date).getTime()
              )
            }
            return currentEmails
          })
        }
      )

      return actionId
    },
    [emails, applyOptimisticUpdate, updateData]
  )

  /**
   * Archive email optimistically
   */
  const archiveEmail = useCallback(
    (emailId: string) => {
      const originalEmail = emails.find(e => e.id === emailId)
      if (!originalEmail) return null

      const actionId = applyOptimisticUpdate(
        'archive',
        { emailId },
        (currentEmails, { emailId }) =>
          currentEmails.filter(email => email.id !== emailId),
        () => {
          // Rollback function - restore the email
          updateData(currentEmails => {
            const emailExists = currentEmails.some(e => e.id === emailId)
            if (!emailExists) {
              return [...currentEmails, originalEmail].sort((a, b) => 
                new Date(b.date).getTime() - new Date(a.date).getTime()
              )
            }
            return currentEmails
          })
        }
      )

      return actionId
    },
    [emails, applyOptimisticUpdate, updateData]
  )

  /**
   * Add label optimistically
   */
  const addLabel = useCallback(
    (emailId: string, label: string) => {
      const originalEmail = emails.find(e => e.id === emailId)
      if (!originalEmail) return null

      const actionId = applyOptimisticUpdate(
        'add-label',
        { emailId, label },
        (currentEmails, { emailId, label }) =>
          currentEmails.map(email =>
            email.id === emailId 
              ? { ...email, labels: [...(email.labels || []), label] }
              : email
          ),
        () => {
          // Rollback function
          updateData(currentEmails =>
            currentEmails.map(email =>
              email.id === emailId ? { ...email, labels: originalEmail.labels } : email
            )
          )
        }
      )

      return actionId
    },
    [emails, applyOptimisticUpdate, updateData]
  )

  return {
    emails,
    isOptimistic,
    pendingActions,
    markAsRead,
    toggleStar,
    deleteEmail,
    archiveEmail,
    addLabel,
    confirmAction,
    failAction,
    updateData
  }
}

/**
 * Higher-order component for wrapping components with optimistic updates
 */
export function withOptimisticUpdates<P extends object>(
  Component: React.ComponentType<P & { optimistic: ReturnType<typeof useOptimisticUpdates> }>,
  initialData: any
) {
  return function OptimisticWrapper(props: P) {
    const optimisticState = useOptimisticUpdates(initialData)
    
    return React.createElement(Component, {
      ...props,
      optimistic: optimisticState
    } as P & { optimistic: ReturnType<typeof useOptimisticUpdates> })
  }
}