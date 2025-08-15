import { useEffect, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'

interface UseEmailPollingOptions {
  enabled?: boolean
  interval?: number
  onNewEmails?: (emails: any[]) => void
  onError?: (error: string) => void
  debug?: boolean
}

export function useEmailPolling(options: UseEmailPollingOptions = {}) {
  const { data: session } = useSession()
  const {
    enabled = true,
    interval = 86400000, // 24 hours
    onNewEmails,
    onError,
    debug = false
  } = options

  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const lastCheckRef = useRef<string | null>(null)
  const isPollingRef = useRef(false)

  const log = useCallback((message: string, ...args: any[]) => {
    if (debug) {
      console.log(`[Email Polling] ${message}`, ...args)
    }
  }, [debug])

  const checkForNewEmails = useCallback(async () => {
    if (!session?.user?.email || isPollingRef.current) {
      return
    }

    isPollingRef.current = true
    log('Checking for new emails...')

    try {
      // First, get the current Gmail profile to check for changes
      const profileResponse = await fetch('/api/gmail/profile')
      if (!profileResponse.ok) {
        if (profileResponse.status === 401) {
          log('Authentication expired, skipping poll')
          return
        }
        throw new Error(`Profile check failed: ${profileResponse.status}`)
      }

      const profile = await profileResponse.json()
      const currentHistoryId = profile.historyId

      // If this is the first check, just store the history ID
      if (!lastCheckRef.current) {
        lastCheckRef.current = currentHistoryId
        log('Initial history ID stored:', currentHistoryId)
        return
      }

      // If history ID hasn't changed, no new emails
      if (lastCheckRef.current === currentHistoryId) {
        log('No changes detected')
        return
      }

      log('Changes detected, fetching new emails...')
      
      // Fetch recent emails to get any new ones
      const emailsResponse = await fetch('/api/emails?category=inbox&limit=10')
      if (!emailsResponse.ok) {
        throw new Error(`Failed to fetch emails: ${emailsResponse.status}`)
      }

      const emailsData = await emailsResponse.json()
      const newEmails = emailsData.emails || []
      log(`Fetched ${newEmails.length} emails from API`)

      // Filter emails that are newer than our last check
      const recentEmails = newEmails.filter((email: any) => {
        const emailTime = new Date(email.receivedAt).getTime()
        const lastCheckTime = Date.now() - (5 * 60 * 1000) // Check emails from last 5 minutes
        return emailTime > lastCheckTime
      })

      log(`After filtering: ${recentEmails.length} recent emails (from ${newEmails.length} total)`)
      
      if (recentEmails.length > 0) {
        log(`Found ${recentEmails.length} new emails`)
        onNewEmails?.(recentEmails)
      } else {
        log('No recent emails found after filtering')
      }

      // Update the last check history ID
      lastCheckRef.current = currentHistoryId

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      log('Polling error:', errorMessage)
      onError?.(errorMessage)
    } finally {
      isPollingRef.current = false
    }
  }, [session, interval, onNewEmails, onError, log])

  const startPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }

    log(`Starting email polling every ${interval}ms`)
    intervalRef.current = setInterval(checkForNewEmails, interval)
    
    // Do an initial check
    checkForNewEmails()
  }, [interval, checkForNewEmails, log])

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      log('Stopping email polling')
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [log])

  // Start/stop polling based on enabled state and session
  useEffect(() => {
    if (enabled && session?.user?.email) {
      startPolling()
    } else {
      stopPolling()
    }

    return () => {
      stopPolling()
    }
  }, [enabled, session?.user?.email, startPolling, stopPolling])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling()
    }
  }, [])

  return {
    startPolling,
    stopPolling,
    isPolling: !!intervalRef.current
  }
}