// Shared date formatting utilities

// Dynamic date formatting function based on email age
export function formatEmailDate(dateString: string): string {
  // Check if the date string is valid
  if (!dateString || !isValidDate(dateString)) {
    return 'Invalid Date'
  }
  
  const date = new Date(dateString)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
  const emailDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  // If email is from today, show time (e.g., "11:53")
  if (emailDate.getTime() === today.getTime()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  }
  
  // If email is from yesterday, show "Yesterday"
  if (emailDate.getTime() === yesterday.getTime()) {
    return 'Yesterday'
  }
  
  // For older emails, show date in regional format
  return date.toLocaleDateString()
}

// Format full date and time for email preview pane
export function formatFullDateTime(dateString: string): { date: string; time: string } {
  const date = new Date(dateString)
  return {
    date: date.toLocaleDateString(),
    time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  }
}

// Validate if a date string is valid
export function isValidDate(dateString: string): boolean {
  const date = new Date(dateString)
  return !isNaN(date.getTime())
}