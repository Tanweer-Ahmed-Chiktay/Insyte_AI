import { gmail_v1 } from 'googleapis'

export interface TransformedEmailData {
  id: string
  gmailId: string
  threadId?: string | null
  subject: string
  from: string
  to: string[]
  snippet: string
  isRead: boolean
  isStarred: boolean
  isImportant: boolean
  labels: string[]
  labelIds: string[]
  receivedAt: string
  category: string
}

/**
 * Transform a Gmail API message object into our standardized email data format
 * @param gmailMessage - The Gmail API message object
 * @returns Transformed email data object
 */
export function transformGmailMessage(gmailMessage: gmail_v1.Schema$Message): TransformedEmailData {
  const headers = gmailMessage.payload?.headers || []
  const getHeader = (name: string) => 
    headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || ''

  // Parse 'To' header which might contain multiple recipients
  const toHeader = getHeader('To')
  const toAddresses = toHeader ? toHeader.split(',').map(addr => addr.trim()) : []

  return {
    id: gmailMessage.id!,
    gmailId: gmailMessage.id!,
    threadId: gmailMessage.threadId,
    subject: getHeader('Subject'),
    from: getHeader('From'),
    to: toAddresses,
    snippet: gmailMessage.snippet || '',
    isRead: !gmailMessage.labelIds?.includes('UNREAD'),
    isStarred: gmailMessage.labelIds?.includes('STARRED') || false,
    isImportant: gmailMessage.labelIds?.includes('IMPORTANT') || false,
    labels: gmailMessage.labelIds || [],
    labelIds: gmailMessage.labelIds || [],
    receivedAt: new Date(parseInt(gmailMessage.internalDate || '0')).toISOString(),
    category: 'inbox' // Default category, can be enhanced based on labels
  }
}

/**
 * Determine the appropriate category for an email based on its labels
 * @param labelIds - Array of Gmail label IDs
 * @returns Email category string
 */
export function determineEmailCategory(labelIds: string[]): string {
  if (labelIds.includes('SENT')) return 'sent'
  if (labelIds.includes('DRAFT')) return 'drafts'
  if (labelIds.includes('SPAM')) return 'spam'
  if (labelIds.includes('TRASH')) return 'trash'
  if (labelIds.includes('STARRED')) return 'starred'
  if (labelIds.includes('IMPORTANT')) return 'important'
  if (labelIds.includes('UNREAD')) return 'unread'
  
  // Default to inbox for most emails
  return 'inbox'
}

/**
 * Enhanced transform function that includes category determination
 * @param gmailMessage - The Gmail API message object
 * @returns Transformed email data object with proper category
 */
export function transformGmailMessageWithCategory(gmailMessage: gmail_v1.Schema$Message): TransformedEmailData {
  const baseData = transformGmailMessage(gmailMessage)
  const category = determineEmailCategory(gmailMessage.labelIds || [])
  
  return {
    ...baseData,
    category
  }
}