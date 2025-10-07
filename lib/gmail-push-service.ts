import { google } from 'googleapis'
import { prisma } from './prisma'
import { wsManager } from './websocket/unified-websocket-manager'
import { transformGmailMessageWithCategory } from './utils/gmail-transformer'

// Batch processing for notifications
interface BatchedNotification {
  emailAddress: string
  historyId: string
  timestamp: number
}

class NotificationBatcher {
  private batch: Map<string, BatchedNotification> = new Map()
  private batchTimeout: NodeJS.Timeout | null = null
  private readonly BATCH_DELAY = 1000 // 1 second
  private readonly MAX_BATCH_SIZE = 10

  addNotification(notification: GmailNotification) {
    const key = notification.emailAddress
    this.batch.set(key, {
      ...notification,
      timestamp: Date.now()
    })

    if (this.batch.size >= this.MAX_BATCH_SIZE) {
      this.processBatch()
    } else if (!this.batchTimeout) {
      this.batchTimeout = setTimeout(() => this.processBatch(), this.BATCH_DELAY)
    }
  }

  private async processBatch() {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout)
      this.batchTimeout = null
    }

    const notifications = Array.from(this.batch.values())
    this.batch.clear()

    if (notifications.length > 0) {
      console.log(`[Gmail Push Service] Processing batch of ${notifications.length} notifications`)
      await Promise.allSettled(
         notifications.map(notification => 
           gmailPushService.processNotification(notification)
         )
       )
    }
  }
}

const notificationBatcher = new NotificationBatcher()

export interface GmailWatchResponse {
  historyId: string
  expiration: string
}

export interface GmailNotification {
  emailAddress: string
  historyId: string
}

class GmailPushService {
  private readonly topicName: string
  private readonly projectId: string

  constructor() {
    this.projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || 'insyte-467414'
    this.topicName = process.env.GMAIL_PUBSUB_TOPIC || `projects/${this.projectId}/topics/MyTopic`
  }

  /**
   * Set up Gmail watch for a user
   */
  async setupWatch(accessToken: string, refreshToken: string, userEmail: string): Promise<GmailWatchResponse> {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    )

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken
    })

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    try {
      // Stop any existing watch first
      await this.stopWatch(accessToken, refreshToken)
    } catch (error) {
      // Ignore errors when stopping watch (might not exist)
      console.log('[Gmail Push Service] No existing watch to stop or error stopping:', error)
    }

    // Set up new watch
    const watchResponse = await gmail.users.watch({
      userId: 'me',
      requestBody: {
        topicName: this.topicName,
        labelIds: ['INBOX'], // Watch inbox changes
        labelFilterAction: 'include'
      }
    })

    const { historyId, expiration } = watchResponse.data

    if (!historyId || !expiration) {
      throw new Error('Invalid watch response from Gmail API')
    }

    // Update user's account with the new historyId
    await prisma.account.updateMany({
      where: {
        user: { email: userEmail },
        provider: 'google'
      },
      data: {
        gmail_history_id: historyId
      }
    })

    console.log(`[Gmail Push Service] Watch set up for ${userEmail}, historyId: ${historyId}, expires: ${new Date(parseInt(expiration))}`)

    return {
      historyId,
      expiration
    }
  }

  /**
   * Stop Gmail watch for a user
   */
  async stopWatch(accessToken: string, refreshToken: string): Promise<void> {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    )

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken
    })

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    await gmail.users.stop({
      userId: 'me'
    })

    console.log('[Gmail Push Service] Watch stopped')
  }

  /**
   * Process Gmail push notification with batching
   */
  async processNotificationBatched(notification: GmailNotification): Promise<void> {
    notificationBatcher.addNotification(notification)
  }

  /**
   * Process Gmail push notification immediately
   */
  async processNotification(notification: GmailNotification): Promise<void> {
    const { emailAddress, historyId } = notification

    console.log(`[Gmail Push Service] Processing notification for ${emailAddress}, historyId: ${historyId}`)

    // Find the user and their Google account
    const user = await prisma.user.findUnique({
      where: { email: emailAddress },
      include: {
        accounts: {
          where: { provider: 'google' }
        }
      }
    })

    if (!user || !user.accounts.length) {
      console.log(`[Gmail Push Service] No user found for email: ${emailAddress}`)
      return
    }

    const account = user.accounts[0]
    if (!account.access_token) {
      console.log(`[Gmail Push Service] No access token for user: ${emailAddress}`)
      return
    }

    // Set up OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    )

    oauth2Client.setCredentials({
      access_token: account.access_token,
      refresh_token: account.refresh_token
    })

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    try {
      // Get the current profile to check the latest historyId
      const profile = await gmail.users.getProfile({ userId: 'me' })
      const currentHistoryId = profile.data.historyId

      // Get the user's last known historyId
      let lastHistoryId = account.gmail_history_id
      
      if (!lastHistoryId) {
        // If no previous historyId, use the notification historyId as starting point
        lastHistoryId = historyId
      }

      // Fetch history changes since last known historyId
      const historyResponse = await gmail.users.history.list({
        userId: 'me',
        startHistoryId: lastHistoryId,
        historyTypes: ['messageAdded', 'messageDeleted'],
        maxResults: 100
      })

      const history = historyResponse.data.history || []
      console.log(`[Gmail Push Service] Found ${history.length} history items`)

      // Process new messages
      const newMessages = []
      const deletedMessages = []

      for (const historyItem of history) {
        if (historyItem.messagesAdded) {
          for (const messageAdded of historyItem.messagesAdded) {
            if (messageAdded.message) {
              newMessages.push(messageAdded.message)
            }
          }
        }
        
        if (historyItem.messagesDeleted) {
          for (const messageDeleted of historyItem.messagesDeleted) {
            if (messageDeleted.message) {
              deletedMessages.push(messageDeleted.message)
            }
          }
        }
      }

      console.log(`[Gmail Push Service] New messages: ${newMessages.length}, Deleted messages: ${deletedMessages.length}`)

      // Update the stored historyId
      await prisma.account.update({
        where: { id: account.id },
        data: { gmail_history_id: currentHistoryId }
      })

      // Broadcast real-time notification to connected clients
      if (newMessages.length > 0 || deletedMessages.length > 0) {
        // For new messages, fetch full email data and broadcast individual emails
        if (newMessages.length > 0) {
          for (const message of newMessages.slice(0, 5)) { // Limit to 5 for performance
            try {
              const fullMessage = await gmail.users.messages.get({
                userId: 'me',
                id: message.id!,
                format: 'full'
              })

              if (fullMessage.data) {
                const emailData = transformGmailMessageWithCategory(fullMessage.data)

                // Broadcast individual new email
                wsManager.broadcastToUser(emailAddress, {
                  type: 'email:new',
                  payload: emailData,
                  timestamp: Date.now()
                })
              }
            } catch (error) {
              console.error(`Failed to fetch full message data for ${message.id}:`, error)
            }
          }
        }

        // For deleted messages, broadcast deletion events
        if (deletedMessages.length > 0) {
          for (const message of deletedMessages) {
            wsManager.broadcastToUser(emailAddress, {
              type: 'email:deleted',
              payload: { emailId: message.id },
              timestamp: Date.now()
            })
          }
        }

        // Also send the general sync update notification
        const notificationData = {
          type: 'gmail-sync-update',
          emailAddress,
          historyId: currentHistoryId,
          changes: {
            newMessages: newMessages.length,
            deletedMessages: deletedMessages.length,
            newMessageIds: newMessages.map(m => m.id),
            deletedMessageIds: deletedMessages.map(m => m.id)
          },
          timestamp: new Date().toISOString()
        }

        wsManager.broadcastToUser(emailAddress, {
          type: 'gmail-push-notification',
          payload: notificationData,
          timestamp: Date.now()
        })
        
        console.log(`[Gmail Push Service] Broadcasted ${newMessages.length} new emails and ${deletedMessages.length} deletions to WebSocket clients for ${emailAddress}`)
      }

    } catch (error: any) {
      if (error.code === 404) {
        console.log('[Gmail Push Service] History not found, updating historyId')
        // Update the stored historyId
        const profile = await gmail.users.getProfile({ userId: 'me' })
        await prisma.account.update({
          where: { id: account.id },
          data: { gmail_history_id: profile.data.historyId }
        })
      } else {
        console.error('[Gmail Push Service] Error processing notification:', error)
        throw error
      }
    }
  }

  /**
   * Check if Gmail watch is properly configured
   */
  isConfigured(): boolean {
    return !!(this.projectId && this.topicName && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
  }

  /**
   * Get configuration status
   */
  getConfigStatus() {
    return {
      projectId: this.projectId,
      topicName: this.topicName,
      hasClientId: !!process.env.GOOGLE_CLIENT_ID,
      hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
      isConfigured: this.isConfigured()
    }
  }
}

// Export singleton instance
export const gmailPushService = new GmailPushService()
export default gmailPushService