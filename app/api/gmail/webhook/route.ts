import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { wsManager } from '@/lib/websocket/unified-websocket-manager'
import { triggerUserEvent, triggerPusherEvent, PUSHER_EVENTS } from '@/lib/pusher-config'
import { prisma } from '@/lib/prisma'
import { transformGmailMessageWithCategory } from '@/lib/utils/gmail-transformer'

// Gmail Pub/Sub webhook endpoint
export async function POST(request: NextRequest) {
  try {
    // Verify webhook authenticity using proper authentication
    const authHeader = request.headers.get('authorization')
    const expectedToken = process.env.GMAIL_WEBHOOK_SECRET
    
    // In development, allow requests without auth for testing
    const isDevelopment = process.env.NODE_ENV === 'development'
    
    if (!isDevelopment) {
      if (!expectedToken) {
        console.error('[Gmail Webhook] GMAIL_WEBHOOK_SECRET not configured')
        return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
      }
      
      if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
        console.log('[Gmail Webhook] Invalid or missing authorization')
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }
    
    // Additional verification: check for Google Cloud Pub/Sub headers
    const userAgent = request.headers.get('user-agent') || ''
    const isValidPubSub = userAgent.includes('Google-Cloud-Pub-Sub') || userAgent.includes('APIs-Google')
    
    if (!isValidPubSub && !isDevelopment) {
      console.log('[Gmail Webhook] Invalid User-Agent:', userAgent)
      return NextResponse.json({ error: 'Invalid request source' }, { status: 400 })
    }
    
    console.log('[Gmail Webhook] Authenticated request from:', userAgent)

    const body = await request.json()
    console.log('[Gmail Webhook] Received notification:', JSON.stringify(body, null, 2))

    // Extract Pub/Sub message
    const { message } = body
    if (!message || !message.data) {
      console.log('[Gmail Webhook] No message data found')
      return NextResponse.json({ error: 'No message data' }, { status: 400 })
    }

    // Decode the base64 message data
    let notificationData
    try {
      const decodedData = Buffer.from(message.data, 'base64').toString('utf-8')
      console.log('[Gmail Webhook] Decoded data:', decodedData)
      
      // Try to parse as JSON, fallback to handling as raw text
      try {
        notificationData = JSON.parse(decodedData)
        console.log('[Gmail Webhook] Parsed JSON notification:', notificationData)
      } catch (jsonError) {
        // Handle non-JSON data (like "Hello World" test messages)
        console.log('[Gmail Webhook] Non-JSON data received, treating as test message:', decodedData)
        if (decodedData.trim() === 'Hello World') {
          console.log('[Gmail Webhook] Ignoring "Hello World" test message')
          return NextResponse.json({ message: 'Test message ignored' }, { status: 200 })
        }
        // For other non-JSON data, return error
        console.error('[Gmail Webhook] Invalid message format - not JSON:', jsonError)
        return NextResponse.json({ error: 'Invalid message format' }, { status: 400 })
      }
    } catch (error) {
      console.error('[Gmail Webhook] Failed to decode base64 message data:', error)
      return NextResponse.json({ error: 'Invalid base64 encoding' }, { status: 400 })
    }

    const { emailAddress, historyId } = notificationData
    
    if (!emailAddress || !historyId) {
      console.log('[Gmail Webhook] Missing emailAddress or historyId in notification data')
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    console.log(`[Gmail Webhook] Processing notification for ${emailAddress}, historyId: ${historyId}`)

    // Find the user account for this email
    const user = await prisma.user.findUnique({
      where: { email: emailAddress },
      include: {
        accounts: {
          where: { provider: 'google' }
        }
      }
    })

    if (!user || !user.accounts.length) {
      console.log(`[Gmail Webhook] No user found for email: ${emailAddress}`)
      // Still return 200 to prevent Google from retrying
      return NextResponse.json({ 
        success: true, 
        message: 'User not registered for notifications' 
      }, { status: 200 })
    }

    const account = user.accounts[0]
    if (!account.access_token) {
      console.log(`[Gmail Webhook] No access token for user: ${emailAddress}`)
      return NextResponse.json({ error: 'No access token' }, { status: 401 })
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

    // Get the current profile to check the latest historyId
    const profile = await gmail.users.getProfile({ userId: 'me' })
    const currentHistoryId = profile.data.historyId

    console.log(`[Gmail Webhook] Current historyId: ${currentHistoryId}, notification historyId: ${historyId}`)

    // Get the user's last known historyId from database
    let lastHistoryId = user.historyId
    
    if (!lastHistoryId) {
      // If no previous historyId, use the notification historyId as starting point
      lastHistoryId = historyId
    }

    // Ensure lastHistoryId is not null before making API call
    if (!lastHistoryId) {
      console.log('[Gmail Webhook] No valid historyId available, skipping history fetch')
      return NextResponse.json({ message: 'No valid historyId' })
    }

    // Fetch history changes since last known historyId
    let historyResponse
    console.log(`[Gmail Webhook] Fetching history from ${lastHistoryId} to current with params:`, {
      userId: 'me',
      startHistoryId: lastHistoryId,
      historyTypes: ['messageAdded', 'messageDeleted'],
      maxResults: 100
    })
    
    try {
      historyResponse = await gmail.users.history.list({
        userId: 'me',
        startHistoryId: lastHistoryId,
        historyTypes: ['messageAdded', 'messageDeleted'],
        maxResults: 100
      })
      console.log('[Gmail Webhook] History API response:', {
        historyLength: historyResponse.data.history?.length || 0,
        nextPageToken: historyResponse.data.nextPageToken
      })
    } catch (error: any) {
      console.error('[Gmail Webhook] History API error:', error)
      if (error.code === 404) {
        console.log('[Gmail Webhook] History not found, using current historyId')
        // Update the stored historyId and return success
        await prisma.user.update({
          where: { id: user.id },
          data: { historyId: currentHistoryId }
        })
        return NextResponse.json({ success: true, message: 'History reset' })
      }
      throw error
    }

    const history = historyResponse.data.history || []
    console.log(`[Gmail Webhook] Found ${history.length} history items`)

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

    console.log(`[Gmail Webhook] New messages: ${newMessages.length}, Deleted messages: ${deletedMessages.length}`)

    // Fallback: If no history items found but we received a webhook notification,
    // fetch recent messages to ensure we don't miss new emails
    if (history.length === 0 && newMessages.length === 0) {
      console.log('[Gmail Webhook] No history found but webhook received - checking recent messages as fallback')
      try {
        const recentMessages = await gmail.users.messages.list({
          userId: 'me',
          maxResults: 10,
          q: 'is:unread'
        })
        
        if (recentMessages.data.messages && recentMessages.data.messages.length > 0) {
          console.log(`[Gmail Webhook] Found ${recentMessages.data.messages.length} recent unread messages`)
          
          // Add recent unread messages to newMessages for processing
          for (const message of recentMessages.data.messages.slice(0, 5)) {
            if (message.id) {
              newMessages.push({ id: message.id })
            }
          }
          console.log(`[Gmail Webhook] Added ${newMessages.length} recent messages for processing`)
        }
      } catch (fallbackError) {
        console.error('[Gmail Webhook] Fallback message fetch failed:', fallbackError)
      }
    }

    // Update the stored historyId
    await prisma.user.update({
      where: { id: user.id },
      data: { historyId: currentHistoryId }
    })

    // Send specific notifications for new and deleted emails
    if (newMessages.length > 0) {
      const newEmailIds = newMessages.map(msg => msg.id).filter((id): id is string => Boolean(id))
      console.log(`[Gmail Webhook] Broadcasting new email notification for ${newEmailIds.length} emails`)
      
      // Broadcast individual new emails with full data (limit to first 5 for performance)
      for (const message of newMessages.slice(0, 5)) {
        try {
          const fullMessage = await gmail.users.messages.get({
            userId: 'me',
            id: message.id!,
            format: 'full'
          })

          if (fullMessage.data) {
            const emailData = transformGmailMessageWithCategory(fullMessage.data)
            
            // Use the specialized method from unified manager
            wsManager.notifyNewEmail(emailAddress, emailData)
            
            // Also trigger Pusher event for real-time updates
            try {
              // Use email-based channel naming to match frontend
              const channelName = `user-${user.email.replace('@', '-').replace('.', '-')}`
              await triggerPusherEvent(channelName, PUSHER_EVENTS.EMAIL_NEW, {
                email: emailData,
                timestamp: Date.now()
              })
              console.log(`[Gmail Webhook] Pusher event triggered for new email: ${emailData.id} on channel: ${channelName}`)
            } catch (pusherError) {
              console.error('[Gmail Webhook] Failed to trigger Pusher event for new email:', pusherError)
            }
          }
        } catch (error) {
          console.error(`Failed to fetch message ${message.id}:`, error)
        }
      }
      
      // Also send the bulk update notification
      wsManager.notifyEmailUpdate(emailAddress, {
        category: 'inbox',
        action: 'added',
        emailIds: newEmailIds,
        count: newEmailIds.length
      })
      
      // Trigger Pusher event for bulk email update
       try {
         const channelName = `user-${user.email.replace('@', '-').replace('.', '-')}`
         await triggerPusherEvent(channelName, PUSHER_EVENTS.EMAIL_UPDATE, {
           category: 'inbox',
           action: 'added',
           emailIds: newEmailIds,
           count: newEmailIds.length,
           timestamp: Date.now()
         })
         console.log(`[Gmail Webhook] Pusher bulk update event triggered for ${newEmailIds.length} emails on channel: ${channelName}`)
       } catch (pusherError) {
         console.error('[Gmail Webhook] Failed to trigger Pusher bulk update event:', pusherError)
       }
    }

    if (deletedMessages.length > 0) {
      const deletedEmailIds = deletedMessages.map(msg => msg.id).filter((id): id is string => Boolean(id))
      console.log(`[Gmail Webhook] Broadcasting deleted email notification for ${deletedEmailIds.length} emails`)
      
      for (const emailId of deletedEmailIds) {
        wsManager.notifyEmailDeleted(emailAddress, emailId)
        
        // Also trigger Pusher event for deleted email
         try {
           const channelName = `user-${user.email.replace('@', '-').replace('.', '-')}`
           await triggerPusherEvent(channelName, PUSHER_EVENTS.EMAIL_DELETED, {
             emailId,
             timestamp: Date.now()
           })
           console.log(`[Gmail Webhook] Pusher event triggered for deleted email: ${emailId} on channel: ${channelName}`)
         } catch (pusherError) {
           console.error('[Gmail Webhook] Failed to trigger Pusher event for deleted email:', pusherError)
         }
      }
    }

    // Broadcast additional webhook-specific notification for debugging
    const webhookNotification = {
      type: 'gmail-push-notification',
      payload: {
        message: {
          data: message.data,
          messageId: message.messageId,
          publishTime: message.publishTime
        },
        notification: {
          emailAddress,
          historyId
        },
        syncStarted: true,
        newEmailCount: newMessages.length,
        deletedEmailCount: deletedMessages.length
      },
      timestamp: Date.now()
    }

    // Broadcast to all connected WebSocket clients for this user
    wsManager.broadcastToUser(emailAddress, webhookNotification)
    console.log(`[Gmail Webhook] Webhook notification broadcasted to WebSocket clients for ${emailAddress}`)

    // Trigger email sync in the background (non-blocking)
    // Note: This background sync may not work due to authentication context
    // The WebSocket notifications should handle real-time updates instead
    console.log('[Gmail Webhook] Skipping background sync - relying on WebSocket notifications for real-time updates')
    
    // Alternative: Could implement a server-side sync job here if needed
    // For now, the WebSocket notifications with email IDs should be sufficient

    return NextResponse.json({ 
      success: true, 
      processed: true,
      emailAddress,
      historyId
    })

  } catch (error) {
    console.error('[Gmail Webhook] Error processing notification:', error)
    return NextResponse.json({ 
      error: 'Failed to process notification',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// Handle GET requests for webhook verification
export async function GET(request: NextRequest) {
  // This can be used for webhook verification if needed
  return NextResponse.json({ 
    status: 'Gmail webhook endpoint active',
    timestamp: new Date().toISOString()
  })
}