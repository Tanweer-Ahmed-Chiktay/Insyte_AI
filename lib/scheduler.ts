// Simple email scheduler that runs in the background
let schedulerInterval: NodeJS.Timeout | null = null

const SCHEDULER_INTERVAL = 60000 // Check every minute

export function startEmailScheduler() {
  if (schedulerInterval) {
    console.log('Email scheduler already running')
    return
  }

  console.log('Starting email scheduler...')
  
  schedulerInterval = setInterval(async () => {
    try {
      const response = await fetch('/api/process-scheduled-emails', {
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
      } else {
        console.error('Failed to process scheduled emails:', response.statusText)
      }
    } catch (error) {
      console.error('Email scheduler error:', error)
    }
  }, SCHEDULER_INTERVAL)
}

export function stopEmailScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval)
    schedulerInterval = null
    console.log('Email scheduler stopped')
  }
}

// Auto-start scheduler in production
if (typeof window === 'undefined' && process.env.NODE_ENV === 'production') {
  startEmailScheduler()
}

// For development, we can manually start it
if (typeof window === 'undefined' && process.env.NODE_ENV === 'development') {
  // Start scheduler after a delay to allow the server to fully initialize
  setTimeout(() => {
    startEmailScheduler()
  }, 5000)
}