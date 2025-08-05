// Simple email scheduler that runs in the background
let schedulerInterval: NodeJS.Timeout | null = null
let isSchedulerStarted = false

const SCHEDULER_INTERVAL = 5 * 60 * 1000 // Check every 5 minutes (reduced frequency)
const MAX_RETRIES = 3
let consecutiveErrors = 0

export function startEmailScheduler() {
  if (isSchedulerStarted || schedulerInterval) {
    console.log('Email scheduler already running')
    return
  }

  console.log('Starting email scheduler...')
  isSchedulerStarted = true
  
  schedulerInterval = setInterval(async () => {
    try {
      const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
      const response = await fetch(`${baseUrl}/api/process-scheduled-emails`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (response.ok) {
        const result = await response.json()
        if (result.processed > 0) {
          console.log(`Processed ${result.processed} scheduled emails`)
        }
        consecutiveErrors = 0 // Reset error count on success
      } else if (response.status === 429) {
        // Rate limited - back off temporarily
        consecutiveErrors++
        console.warn(`Rate limited (${consecutiveErrors}/${MAX_RETRIES}). Backing off...`)
        
        if (consecutiveErrors >= MAX_RETRIES) {
          console.warn('Too many rate limit errors. Stopping scheduler temporarily.')
          stopEmailScheduler()
          // Restart after 10 minutes
          setTimeout(() => {
            console.log('Restarting scheduler after rate limit cooldown')
            startEmailScheduler()
          }, 10 * 60 * 1000)
          return
        }
      } else {
        console.error('Failed to process scheduled emails:', response.statusText)
        consecutiveErrors++
      }
    } catch (error) {
      console.error('Email scheduler error:', error)
      consecutiveErrors++
      
      if (consecutiveErrors >= MAX_RETRIES) {
        console.error('Too many consecutive errors. Stopping scheduler.')
        stopEmailScheduler()
      }
    }
  }, SCHEDULER_INTERVAL)
}

export function stopEmailScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval)
    schedulerInterval = null
    isSchedulerStarted = false
    consecutiveErrors = 0
    console.log('Email scheduler stopped')
  }
}

// Only auto-start in production - let components handle development
if (typeof window === 'undefined' && process.env.NODE_ENV === 'production') {
  // Start scheduler after a delay to allow the server to fully initialize
  setTimeout(() => {
    startEmailScheduler()
  }, 10000)
}