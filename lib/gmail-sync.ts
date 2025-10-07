import { google } from 'googleapis'
import { prisma } from './prisma'

interface GmailSyncOptions {
  userId: string
  accessToken: string
  refreshToken: string
  startHistoryId?: string
}

export async function syncGmailHistory(options: GmailSyncOptions) {
  const { userId, accessToken, refreshToken, startHistoryId } = options

  // Set up OAuth2 client
  const oAuth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )
  
  oAuth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  })

  const gmail = google.gmail({ version: 'v1', auth: oAuth2Client })

  if (!startHistoryId) {
    // If no history ID, do a full sync
    return await fullGmailSync(gmail, userId)
  }

  try {
    // Get history changes since last known historyId
    const historyResponse = await gmail.users.history.list({
      userId: 'me',
      startHistoryId,
      maxResults: 100,
    })

    const history = historyResponse.data.history || []
    const newHistoryId = historyResponse.data.historyId
    
    console.log(`Processing ${history.length} history items for user ${userId}`)

    let processedCount = 0
    let errorCount = 0

    // Process each history item
    const addedMessageIds: string[] = []
    for (const historyItem of history) {
      try {
        // Handle messages added
        if (historyItem.messagesAdded) {
          for (const messageAdded of historyItem.messagesAdded) {
            if (messageAdded.message?.id) {
              addedMessageIds.push(messageAdded.message.id)
            }
          }
        }

        // Handle messages deleted (moved to trash)
        if (historyItem.messagesDeleted) {
          for (const messageDeleted of historyItem.messagesDeleted) {
            // Instead of deleting, update the message labels to reflect trash status
            await updateMessageLabels(gmail, messageDeleted.message!.id!, userId)
            processedCount++
          }
        }

        // Handle label changes
        if (historyItem.labelsAdded || historyItem.labelsRemoved) {
          const messageId = historyItem.labelsAdded?.[0]?.message?.id || 
                           historyItem.labelsRemoved?.[0]?.message?.id
          if (messageId) {
            await updateMessageLabels(gmail, messageId, userId)
            processedCount++
          }
        }
      } catch (error) {
        console.error('Error processing history item:', error)
        errorCount++
      }
    }

    // Process added messages using batch processing
    if (addedMessageIds.length > 0) {
      const { getBatchProcessor } = await import('./gmail-batch-processor')
      const batchProcessor = getBatchProcessor(accessToken)
      
      // Process in smaller batches to avoid rate limits
      const batchSize = 10
      for (let i = 0; i < addedMessageIds.length; i += batchSize) {
        const batch = addedMessageIds.slice(i, i + batchSize)
        try {
          const results = await batchProcessor.fetchMessagesBatch(batch, 'full')
          
          for (const result of results) {
             if (result.success && result.data) {
               await processMessage(gmail, { id: result.messageId, ...result.data }, userId)
               processedCount++
             } else {
               console.warn(`Failed to fetch message ${result.messageId}:`, result.error)
             }
           }
          
          // Add delay between batches to respect rate limits
          if (i + batchSize < addedMessageIds.length) {
            await new Promise(resolve => setTimeout(resolve, 100))
          }
        } catch (error) {
           console.error(`Error processing batch ${i}-${i + batchSize}:`, error)
         }
       }
     }

     // Update user's historyId
    if (newHistoryId) {
      await prisma.user.update({
        where: { id: userId },
        data: { historyId: newHistoryId },
      })
    }

    // Log sync completion to help with debugging cache issues
    if (processedCount > 0) {
      console.log(`Gmail sync completed: processed ${processedCount} changes, ${errorCount} errors. Frontend should refresh to see updates.`)
    }

    return {
      success: true,
      processedCount,
      errorCount,
      newHistoryId,
    }

  } catch (error) {
    console.error('Gmail history sync error:', error)
    throw error
  }
}

export async function fullGmailSync(gmail: any, userId: string) {
  try {
    // Get all messages from inbox, sent, and drafts
    const labels = ['INBOX', 'SENT', 'DRAFT']
    let allMessages: any[] = []

    for (const labelId of labels) {
      const response = await gmail.users.messages.list({
        userId: 'me',
        labelIds: [labelId],
        maxResults: 100, // Limit for initial sync
      })
      
      if (response.data.messages) {
        allMessages = allMessages.concat(response.data.messages)
      }
    }

    // Remove duplicates based on message ID
    const uniqueMessages = allMessages.filter((message, index, self) => 
      index === self.findIndex(m => m.id === message.id)
    )

    console.log(`Full sync: processing ${uniqueMessages.length} messages`)

    let processedCount = 0
    let errorCount = 0

    // Process messages in batches
    const batchSize = 10
    for (let i = 0; i < uniqueMessages.length; i += batchSize) {
      const batch = uniqueMessages.slice(i, i + batchSize)
      
      await Promise.allSettled(
        batch.map(async (message) => {
          try {
            await processMessage(gmail, message, userId)
            processedCount++
          } catch (error) {
            console.error(`Error processing message ${message.id}:`, error)
            errorCount++
          }
        })
      )
    }

    // Get current history ID for future syncs
    const profileResponse = await gmail.users.getProfile({ userId: 'me' })
    const currentHistoryId = profileResponse.data.historyId

    // Update user's historyId
    await prisma.user.update({
      where: { id: userId },
      data: { historyId: currentHistoryId },
    })

    // Log full sync completion to help with debugging cache issues
    if (processedCount > 0) {
      console.log(`Gmail full sync completed: processed ${processedCount} emails, ${errorCount} errors. Frontend should refresh to see updates.`)
    }

    return {
      success: true,
      processedCount,
      errorCount,
      newHistoryId: currentHistoryId,
    }

  } catch (error) {
    console.error('Full Gmail sync error:', error)
    throw error
  }
}

export async function processMessage(gmail: any, message: any, userId: string) {
  try {
    // Get full message details
    const messageDetails = await gmail.users.messages.get({
      userId: 'me',
      id: message.id,
      format: 'full',
    })

    const msg = messageDetails.data
    const headers = msg.payload?.headers || []
    
    // Extract email data
    const subject = headers.find((h: any) => h.name === 'Subject')?.value || ''
    const from = headers.find((h: any) => h.name === 'From')?.value || ''
    const to = headers.find((h: any) => h.name === 'To')?.value || ''
    const cc = headers.find((h: any) => h.name === 'Cc')?.value || ''
    const bcc = headers.find((h: any) => h.name === 'Bcc')?.value || ''
    const date = headers.find((h: any) => h.name === 'Date')?.value
    
    // Extract body content
    let content = ''
    if (msg.payload?.body?.data) {
      content = Buffer.from(msg.payload.body.data, 'base64').toString('utf-8')
    } else if (msg.payload?.parts) {
      // Handle multipart messages
      for (const part of msg.payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          content += Buffer.from(part.body.data, 'base64').toString('utf-8')
        }
      }
    }

    // Determine email flags from labels
    const labelIds = msg.labelIds || []
    const isRead = !labelIds.includes('UNREAD')
    const isStarred = labelIds.includes('STARRED')
    const isImportant = labelIds.includes('IMPORTANT')
    const isSpam = labelIds.includes('SPAM')
    const isTrash = labelIds.includes('TRASH')
    const isDraft = labelIds.includes('DRAFT')

    // Get or create email provider
    const emailProvider = await prisma.emailProvider.findFirst({
      where: {
        userId: userId,
        provider: 'gmail',
        isActive: true
      }
    })

    if (!emailProvider) {
      throw new Error('No active Gmail provider found for user')
    }

    // Upsert email in database
    await prisma.email.upsert({
      where: {
        providerId_externalId: {
          providerId: emailProvider.id,
          externalId: message.id
        }
      },
      update: {
        subject,
        from,
        to: to ? [to] : [],
        cc: cc ? [cc] : [],
        bcc: bcc ? [bcc] : [],
        content,
        snippet: msg.snippet || '',
        labels: labelIds,
        isRead,
        isStarred,
        isImportant,
        isSpam,
        isTrash,
        isDraft,
        updatedAt: new Date(),
      },
      create: {
        externalId: message.id,
        user: { connect: { id: userId } },
        provider: { connect: { id: emailProvider.id } },
        threadId: msg.threadId || message.id,
        subject,
        from,
        to: to ? [to] : [],
        cc: cc ? [cc] : [],
        bcc: bcc ? [bcc] : [],
        content,
        snippet: msg.snippet || '',
        labels: labelIds,
        isRead,
        isStarred,
        isImportant,
        isSpam,
        isTrash,
        isDraft,
        receivedAt: date ? new Date(date) : new Date(parseInt(msg.internalDate || '0')),
      },
    })

    console.log(`Processed message: ${message.id}`)

  } catch (error) {
    console.error(`Error processing message ${message.id}:`, error)
    throw error
  }
}

export async function deleteMessage(messageId: string, userId: string) {
  try {
    // Only permanently delete if the message is truly gone from Gmail
    // This should rarely be called - most "deletions" are moves to trash
    await prisma.email.deleteMany({
      where: {
        externalId: messageId,
        userId,
      },
    })
    console.log(`Permanently deleted message: ${messageId}`)
  } catch (error) {
    console.error(`Error deleting message ${messageId}:`, error)
    throw error
  }
}

export async function updateMessageLabels(gmail: any, messageId: string, userId: string) {
  try {
    // Get updated message details
    const messageDetails = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'minimal',
    })

    const labelIds = messageDetails.data.labelIds || []
    const isRead = !labelIds.includes('UNREAD')
    const isStarred = labelIds.includes('STARRED')
    const isImportant = labelIds.includes('IMPORTANT')
    const isSpam = labelIds.includes('SPAM')
    const isTrash = labelIds.includes('TRASH')
    const isDraft = labelIds.includes('DRAFT')
    const isSent = labelIds.includes('SENT')
    const isInbox = labelIds.includes('INBOX')

    await prisma.email.updateMany({
      where: {
        externalId: messageId,
        userId,
      },
      data: {
        labels: labelIds,
        isRead,
        isStarred,
        isImportant,
        isSpam,
        isTrash,
        isDraft,
        updatedAt: new Date(),
      },
    })

    console.log(`Updated labels for message ${messageId} - Trash: ${isTrash}, Spam: ${isSpam}, Draft: ${isDraft}`)

  } catch (error) {
    console.error(`Error updating labels for message ${messageId}:`, error)
    throw error
  }
}