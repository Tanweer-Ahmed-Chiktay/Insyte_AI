import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'

import { google } from 'googleapis'
import { prisma } from '@/lib/prisma'
import { truncateText } from '@/lib/utils'
// Removed prisma-wrapper - using prisma directly

export const runtime = "nodejs"
// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic'
export const revalidate = 300 // 5 minutes cache

// Helper function to categorize emails based on Gmail labels
function categorizeEmail(labels: string[], isSelfSent: boolean = false): string {
  // Self-sent emails should appear in inbox even if they have SENT label
  if (isSelfSent && (labels.includes('INBOX') || labels.includes('SENT'))) return 'inbox'
  if (labels.includes('SENT') && !isSelfSent) return 'sent'
  if (labels.includes('DRAFT')) return 'draft'
  if (labels.includes('SPAM')) return 'spam'
  if (labels.includes('TRASH')) return 'trash'
  if (labels.includes('CATEGORY_SOCIAL')) return 'social'
  if (labels.includes('CATEGORY_PROMOTIONS')) return 'promotions'
  if (labels.includes('CATEGORY_UPDATES')) return 'updates'
  if (labels.includes('CATEGORY_FORUMS')) return 'forums'
  if (labels.includes('STARRED')) return 'starred'
  if (labels.includes('IMPORTANT')) return 'important'
  if (labels.includes('INBOX')) return 'inbox'
  return 'inbox'
}

// Helper function to check if email is self-sent
function checkIsSelfSent(from: string, to: string[], userEmail: string): boolean {
  return from.includes(userEmail) && (to.some(email => email.includes(userEmail)) || to.length === 0)
}

// Helper function to get database filter for email categories
function getCategoryFilter(category: string) {
  switch (category) {
    case 'sent':
      return { labels: { has: 'SENT' } }
    case 'promotions':
      return { labels: { has: 'CATEGORY_PROMOTIONS' } }
    case 'social':
      return { labels: { has: 'CATEGORY_SOCIAL' } }
    case 'starred':
      return { isStarred: true }
    case 'important':
      return { isImportant: true }
    case 'inbox':
    default:
      return { 
        AND: [
          { labels: { has: 'INBOX' } },
          { NOT: { labels: { hasSome: ['CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'DRAFT', 'SPAM', 'TRASH'] } } }
        ]
      }
  }
}

// Helper function to get cached emails from database
async function getCachedEmails(userId: string, userEmail: string, category: string, maxResults: number, since?: string | null, olderThan?: string | null) {
  try {
    const whereClause: any = {
      userId
    }
    
    // Add category-specific filters based on labels
    switch (category) {
      case 'sent':
        whereClause.labels = { has: 'SENT' }
        break
      case 'promotions':
        whereClause.labels = { has: 'CATEGORY_PROMOTIONS' }
        break
      case 'social':
        whereClause.labels = { has: 'CATEGORY_SOCIAL' }
        break
      case 'starred':
        whereClause.isStarred = true
        break
      case 'important':
        whereClause.isImportant = true
        break
      case 'inbox':
      default:
        whereClause.AND = [
          {
            OR: [
              { labels: { has: 'INBOX' } },
              {
                AND: [
                  { labels: { has: 'SENT' } },
                  { to: { has: userEmail } } // Self-sent emails
                ]
              }
            ]
          },
          { NOT: { labels: { hasSome: ['CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'DRAFT', 'SPAM', 'TRASH'] } } }
        ]
        break
    }

    // Add date filter if since parameter is provided
    if (since) {
      whereClause.receivedAt = {
        gte: new Date(since)
      }
    }
    
    // Add olderThan filter for pagination
    if (olderThan) {
      const olderThanDate = new Date(olderThan)
      const thirtyDaysBefore = new Date(olderThanDate.getTime() - (30 * 24 * 60 * 60 * 1000))
      
      whereClause.receivedAt = {
        gte: thirtyDaysBefore,
        lt: olderThanDate
      }
    } else if (!since) {
      // Default to last 60 days if no specific date range
      const sixtyDaysAgo = new Date(Date.now() - (60 * 24 * 60 * 60 * 1000))
      whereClause.receivedAt = {
        gte: sixtyDaysAgo
      }
    }

    const cachedEmails = await prisma.email.findMany({
      where: whereClause,
      orderBy: { receivedAt: 'desc' },
      take: maxResults,
      include: {
        summaries: {
          where: { userId },
          take: 1,
          orderBy: { createdAt: 'desc' }
        }
      }
    })

    // Transform database emails to API format
    return cachedEmails.map(email => ({
      id: email.externalId,
      subject: email.subject,
      from: email.from,
      snippet: truncateText(email.snippet || '', 100),
      receivedAt: email.receivedAt.toISOString(),
      isRead: email.isRead,
      isStarred: email.isStarred,
      isImportant: email.isImportant,
      threadId: email.threadId,
      labelIds: email.labels,
      labels: email.labels,
      category: categorizeEmail(email.labels, checkIsSelfSent(email.from, email.to, userEmail)),
      summary: email.summaries[0] ? {
        id: email.summaries[0].id,
        summary: email.summaries[0].summary,
        sentiment: email.summaries[0].sentiment,
        priority: email.summaries[0].priority,
        category: email.summaries[0].category,
        keyPoints: email.summaries[0].keyPoints,
        actionItems: email.summaries[0].actionItems,
        createdAt: email.summaries[0].createdAt.toISOString(),
        updatedAt: email.summaries[0].updatedAt.toISOString()
      } : null
    }))
  } catch (error) {
    console.error('Error fetching cached emails:', error)
    return []
  }
}

export async function GET(request: NextRequest) {
  let token: any = null
  
  try {
    // Get query parameters for incremental fetching
    const { searchParams } = request.nextUrl
    const since = searchParams.get('since') // ISO date string for incremental fetching
    const maxResults = parseInt(searchParams.get('maxResults') || '50')
    const category = searchParams.get('category') || 'inbox'
    const forceRefresh = searchParams.get('forceRefresh') === 'true'
    const olderThan = searchParams.get('olderThan') // New parameter for pagination
    const refreshOnly = searchParams.get('refreshOnly') === 'true' // New parameter for refresh button
    
    // Debug: Check cookies
    const cookies = request.headers.get('cookie')
    console.log('Request cookies:', cookies)
    
    // Get session which contains user information
    const session = await getServerSession(authOptions)
    
    console.log('Session check:', {
      hasSession: !!session,
      userEmail: session?.user?.email,
      userId: session?.user?.id
    })
    
    if (!session?.user?.email) {
      console.error('No session or user email found')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's Gmail access token from database
    const account = await prisma.account.findFirst({
      where: {
        userId: session.user.id,
        provider: 'google'
      }
    })

    if (!account?.access_token) {
      console.error('No access token found in database')
      return NextResponse.json({ 
        error: 'Gmail account not connected', 
        message: 'Please sign out and sign in again to connect your Gmail account',
        requiresReauth: true 
      }, { status: 401 })
    }
    
    const accessToken = account.access_token
    const refreshToken = account.refresh_token
    
    // Create token object for compatibility with existing code
    token = {
      email: session.user.email,
      accessToken: accessToken,
      refreshToken: refreshToken,
      sub: session.user.id
    }

    // Ensure user exists in database
    const user = await prisma.user.upsert({
      where: { email: token.email },
      update: {
        name: token.name || null,
        image: token.picture || null
      },
      create: {
        email: token.email,
        name: token.name || null,
        image: token.picture || null
      }
    }) as any

    // Ensure Gmail email provider exists for this user
    const emailProvider = await prisma.emailProvider.upsert({
      where: {
        userId_provider_email: {
          userId: user.id,
          provider: 'gmail',
          email: user.email
        }
      },
      update: {
        isActive: true
      },
      create: {
        userId: user.id,
        provider: 'gmail',
        email: user.email,
        isActive: true
      }
    })

    // Calculate date ranges for 60-day system
    const now = new Date()
    const sixtyDaysAgo = new Date(now.getTime() - (60 * 24 * 60 * 60 * 1000))
    
    // If refreshOnly is true, only fetch new emails (newer than latest cached)
    if (refreshOnly) {
      const latestEmail = await prisma.email.findFirst({
        where: {
          userId: user.id,
          ...(category === 'sent' ? { labels: { has: 'SENT' } } :
             category === 'promotions' ? { labels: { has: 'CATEGORY_PROMOTIONS' } } :
             category === 'social' ? { labels: { has: 'CATEGORY_SOCIAL' } } :
             category === 'starred' ? { isStarred: true } :
             category === 'important' ? { isImportant: true } :
             { 
               AND: [
                 { labels: { has: 'INBOX' } },
                 { NOT: { labels: { hasSome: ['CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'DRAFT', 'SPAM', 'TRASH'] } } }
               ]
             })
        },
        orderBy: {
          receivedAt: 'desc'
        },
        select: {
          receivedAt: true
        }
      })
      
      if (latestEmail) {
        // For refresh, look for emails from the last 48 hours to catch any new ones
        // For regular pagination, use the latest cached email date
        let searchDate: Date
        if (refreshOnly) {
          // Look for emails from the last 48 hours to ensure we don't miss any due to timezone issues
          searchDate = new Date(Date.now() - 48 * 60 * 60 * 1000)
          console.log(`Refresh mode: looking for emails from last 48 hours`)
        } else {
          // Use latest cached email date minus 1 hour for pagination to handle timezone issues
          searchDate = new Date(latestEmail.receivedAt.getTime() - 60 * 60 * 1000)
          console.log(`Pagination mode: looking for emails after latest cached (with 1hr buffer)`)
        }
        
        // Format date for Gmail API (YYYY/MM/DD format)
        // Subtract one day from the search date to ensure we don't miss emails due to date-only filtering
        const adjustedDate = new Date(searchDate.getTime() - 24 * 60 * 60 * 1000)
        const afterDate = adjustedDate.toISOString().split('T')[0].replace(/-/g, '/')
        console.log(`Looking for emails after: ${afterDate} (latest cached: ${latestEmail.receivedAt.toISOString()})`)
        console.log(`Refresh mode: ${refreshOnly}, Category: ${category}, OlderThan: ${olderThan}`)
        
        // Initialize Gmail API
        const oauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET
        )
        oauth2Client.setCredentials({
          access_token: token.accessToken as string,
          refresh_token: token.refreshToken as string
        })
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
        
        // Build Gmail query for new emails only
        let query = ''
        switch (category) {
          case 'sent':
            query = 'in:sent'
            break
          case 'promotions':
            query = 'category:promotions'
            break
          case 'social':
            query = 'category:social'
            break
          case 'starred':
            query = 'is:starred'
            break
          case 'important':
            query = 'is:important'
            break
          case 'inbox':
          default:
            // Include both inbox emails and self-sent emails (emails sent to yourself)
            query = `(in:inbox OR (in:sent to:${user.email})) -category:promotions -category:social`
            break
        }
        query += ` after:${afterDate}`
        
        console.log(`Fetching new emails with query: ${query}`)
        
        const emailList = await gmail.users.messages.list({
          userId: 'me',
          q: query,
          maxResults: maxResults
        })
        
        let newEmailsCount = 0
        let emails: any[] = []
        
        if (emailList.data.messages && emailList.data.messages.length > 0) {
          // Use batch processing to reduce API calls and avoid rate limits
          const { getBatchProcessor } = await import('@/lib/gmail-batch-processor')
          const batchProcessor = getBatchProcessor(token.accessToken as string)
          
          const messagesToProcess = emailList.data.messages.slice(0, 20)
          const messageIds = messagesToProcess.map(msg => msg.id!)
          
          // Check which emails already exist to avoid duplicates
          const existingEmails = await prisma.email.findMany({
            where: {
              externalId: { in: messageIds },
              userId: user.id
            },
            select: { externalId: true }
          })
          
          const existingIds = new Set(existingEmails.map(e => e.externalId))
          const newMessageIds = messageIds.filter(id => !existingIds.has(id))
          
          console.log(`Processing ${newMessageIds.length} new emails out of ${messageIds.length} total`)
          
          if (newMessageIds.length === 0) {
            return NextResponse.json({ 
              emails: [], 
              totalCount: 0, 
              newEmailsCount: 0,
              message: 'No new emails to process'
            })
          }
          
          // Batch fetch email details
          const batchResults = await batchProcessor.fetchMessagesBatch(newMessageIds, 'full')
          
          // Process batch results
          emails = await Promise.all(
            batchResults.map(async (result) => {
              try {
                if (!result.success || !result.data) {
                  console.warn(`Failed to fetch message ${result.messageId}:`, result.error)
                  return null
                }
                
                const emailDetail = { data: result.data }
                
                const headers = emailDetail.data.payload?.headers || []
                const subject = headers.find((h: any) => h.name === 'Subject')?.value || 'No Subject'
                const from = headers.find((h: any) => h.name === 'From')?.value || 'Unknown Sender'
                const to = headers.find((h: any) => h.name === 'To')?.value || ''
                const dateHeader = headers.find((h: any) => h.name === 'Date')?.value || new Date().toISOString()
                console.log('Gmail date header:', dateHeader)
                
                // Parse the date more robustly
                let parsedDate: Date
                try {
                  parsedDate = new Date(dateHeader)
                  if (isNaN(parsedDate.getTime())) {
                    console.warn('Invalid date from Gmail:', dateHeader, 'using current date')
                    parsedDate = new Date()
                  }
                } catch (error) {
                  console.error('Error parsing date:', dateHeader, error)
                  parsedDate = new Date()
                }
                
                // Get email snippet
                let snippet = emailDetail.data.snippet || ''
                
                // Extract email content
                let content = ''
                if (emailDetail.data.payload?.body?.data) {
                  content = Buffer.from(emailDetail.data.payload.body.data, 'base64').toString('utf-8')
                } else if (emailDetail.data.payload?.parts) {
                  // Handle multipart emails
                  const textPart = emailDetail.data.payload.parts.find((part: any) => part.mimeType === 'text/plain')
                  if (textPart?.body?.data) {
                    content = Buffer.from(textPart.body.data, 'base64').toString('utf-8')
                  }
                }
                
                // Get Gmail labels
                const labels = emailDetail.data.labelIds || []
                
                // Check if email is read
                const isRead = !labels.includes('UNREAD')
                
                // Check if email is starred
                const isStarred = labels.includes('STARRED') || false
                
                // Check if email is important
                const isImportant = labels.includes('IMPORTANT') || false
                
                // Check email category flags based on Gmail labels
                const isSpam = labels.includes('SPAM')
                const isTrash = labels.includes('TRASH')
                const isDraft = labels.includes('DRAFT')

                // Cache email in database with proper categorization
                await prisma.email.upsert({
                    where: {
                      providerId_externalId: {
                        providerId: emailProvider.id,
                        externalId: result.messageId
                      }
                    },
                  update: {
                    subject,
                    from,
                    to: to ? [to] : [],
                    content,
                    snippet,
                    labels,
                    isRead,
                    isStarred,
                    isImportant,
                    isSpam,
                    isTrash,
                    isDraft,
                    receivedAt: parsedDate
                  },
                  create: {
                    externalId: result.messageId,
                    user: { connect: { id: user.id } },
                    provider: { connect: { id: emailProvider.id } },
                    threadId: emailDetail.data.threadId || '',
                    subject,
                    from,
                    to: to ? [to] : [],
                    cc: [],
                    bcc: [],
                    content,
                    snippet,
                    labels,
                    isRead,
                    isStarred,
                    isImportant,
                    isSpam,
                    isTrash,
                    isDraft,
                    receivedAt: parsedDate
                  }
                })

                newEmailsCount++
                console.log(`Cached new email: ${subject}`)
                
                // Check if this is a self-sent email (from user to themselves)
                const isSelfSent = from.includes(user.email) && (to.includes(user.email) || to === '')
                
                // For self-sent emails in inbox view, display "Me" as sender
                const displayFrom = isSelfSent && labels.includes('INBOX') ? 'Me' : from
                
                return {
                  id: result.messageId,
                  subject,
                  from: displayFrom,
                  snippet: truncateText(snippet, 100),
                  receivedAt: parsedDate.toISOString(),
                  isRead,
                  isStarred,
                  isImportant,
                  threadId: emailDetail.data.threadId,
                  labelIds: labels,
                  labels: labels,
                  category: categorizeEmail(labels, isSelfSent)
                }
              } catch (error) {
                console.error(`Error processing email ${result.messageId}:`, error)
                return null
              }
            })
          )
        }
        
        // Filter out null values from processed emails
        const newEmails = emails.filter((email: any) => email !== null)
        
        // Get cached emails (excluding the newly fetched ones to avoid duplicates)
        const cachedEmails = await getCachedEmails(user.id, user.email, category, maxResults, since)
        
        // Create a Set of Gmail IDs from new emails for efficient lookup
        const newEmailIds = new Set(newEmails.map((email: any) => email.id))
        
        // Filter cached emails to exclude any that were just fetched
        const filteredCachedEmails = cachedEmails.filter((email: any) => !newEmailIds.has(email.id))
        
        // Combine new emails with filtered cached emails, sorted by date
        const allEmails = [...newEmails, ...filteredCachedEmails]
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .slice(0, maxResults)
        
        console.log(`Refresh complete: ${newEmails.length} new emails, ${filteredCachedEmails.length} cached emails, ${allEmails.length} total`)
        
        return NextResponse.json({
          emails: allEmails,
          cacheInfo: {
            source: newEmailsCount > 0 ? 'mixed' : 'cache',
            cached: filteredCachedEmails.length,
            newlyFetched: newEmailsCount,
            lastFetched: new Date().toISOString(),
            category
          },
          pagination: {
            hasMore: false,
            nextOlderThan: undefined,
            currentPeriod: '60 days'
          },
          nextPageToken: null,
          hasMore: false,
          fromCache: newEmailsCount === 0,
          newEmailsCount,
          totalCount: allEmails.length
        })
      }
    }

    // First, try to get emails from database cache
    if (!forceRefresh && !refreshOnly) {
      const cachedEmails = await getCachedEmails(user.id, user.email, category, maxResults, since, olderThan)
      if (cachedEmails.length > 0 && !olderThan) {
        console.log(`Returning ${cachedEmails.length} cached emails for category: ${category}`)
        return NextResponse.json({
          emails: cachedEmails,
          cacheInfo: {
            source: 'cache',
            cached: cachedEmails.length,
            newlyFetched: 0,
            lastFetched: new Date().toISOString(),
            category
          },
          nextPageToken: null,
          hasMore: false,
          fromCache: true
        }, {
          headers: {
            'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300'
          }
        })
      }
    }

    // Initialize Gmail API for fetching new emails
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    )

    oauth2Client.setCredentials({
      access_token: token.accessToken as string,
      refresh_token: token.refreshToken as string
    })

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    // Build Gmail query based on category
    let query = ''
    switch (category) {
      case 'sent':
        query = 'in:sent'
        break
      case 'promotions':
        query = 'category:promotions'
        break
      case 'social':
        query = 'category:social'
        break
      case 'starred':
        query = 'is:starred'
        break
      case 'important':
        query = 'is:important'
        break
      case 'inbox':
      default:
        query = 'in:inbox -category:promotions -category:social'
        break
    }
    
    // Add date filters for pagination
    if (olderThan) {
      const beforeDate = new Date(olderThan).toISOString().split('T')[0].replace(/-/g, '/')
      query += ` before:${beforeDate}`
    }
    
    // For incremental fetching, get the latest email date from database
    let lastEmailDate: Date | null = null
    if (!since && !forceRefresh) {
      const latestEmail = await prisma.email.findFirst({
        where: { 
          userId: user.id,
          ...(category === 'sent' ? { labels: { has: 'SENT' } } :
             category === 'promotions' ? { labels: { has: 'CATEGORY_PROMOTIONS' } } :
             category === 'social' ? { labels: { has: 'CATEGORY_SOCIAL' } } :
             category === 'starred' ? { isStarred: true } :
             category === 'important' ? { isImportant: true } :
             { 
               AND: [
                 { labels: { has: 'INBOX' } },
                 { NOT: { labels: { hasSome: ['CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'DRAFT', 'SPAM', 'TRASH'] } } }
               ]
             })
        },
        orderBy: { receivedAt: 'desc' },
        select: { receivedAt: true }
      })
      lastEmailDate = latestEmail?.receivedAt || null
    }
    
    if (since) {
      const sinceDate = new Date(since)
      const formattedDate = sinceDate.toISOString().split('T')[0].replace(/-/g, '/')
      query += ` after:${formattedDate}`
    } else if (lastEmailDate && !forceRefresh) {
      // Only fetch emails newer than the latest cached email
      const formattedDate = lastEmailDate.toISOString().split('T')[0].replace(/-/g, '/')
      query += ` after:${formattedDate}`
      console.log(`Fetching emails newer than: ${formattedDate}`)
    }
    
    console.log('Gmail query:', query)
    
    // Get email list from Gmail
    const emailList = await gmail.users.messages.list({
      userId: 'me',
      maxResults,
      q: query
    })

    let newEmails: any[] = []
    let newEmailsCount = 0

    if (emailList.data.messages && emailList.data.messages.length > 0) {
      console.log(`Found ${emailList.data.messages.length} emails from Gmail API`)
      
      // Get detailed information for each email
      const emails = await Promise.all(
        emailList.data.messages.slice(0, 20).map(async (message) => {
          try {
            // Check if email already exists in database
            const existingEmail = await prisma.email.findFirst({
              where: {
                providerId: emailProvider.id,
                externalId: message.id!
              }
            })

            if (existingEmail && !forceRefresh) {
              console.log(`Email ${message.id} already cached, skipping`)
              return null // Skip already cached emails
            }

            const emailDetail = await gmail.users.messages.get({
              userId: 'me',
              id: message.id!,
              format: 'full'
            })

            const headers = emailDetail.data.payload?.headers || []
            const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject'
            const from = headers.find(h => h.name === 'From')?.value || 'Unknown Sender'
            const to = headers.find(h => h.name === 'To')?.value || ''
            const date = headers.find(h => h.name === 'Date')?.value || new Date().toISOString()
            
            // Get email snippet
            let snippet = emailDetail.data.snippet || ''
            
            // Extract email content
            let content = ''
            if (emailDetail.data.payload?.body?.data) {
              content = Buffer.from(emailDetail.data.payload.body.data, 'base64').toString('utf-8')
            } else if (emailDetail.data.payload?.parts) {
              // Handle multipart emails
              const textPart = emailDetail.data.payload.parts.find(part => part.mimeType === 'text/plain')
              if (textPart?.body?.data) {
                content = Buffer.from(textPart.body.data, 'base64').toString('utf-8')
              }
            }
            
            // Get Gmail labels
            const labels = emailDetail.data.labelIds || []
            
            // Check if email is read
            const isRead = !labels.includes('UNREAD')
            
            // Check if email is starred
            const isStarred = labels.includes('STARRED') || false
            
            // Check if email is important
            const isImportant = labels.includes('IMPORTANT') || false
            
            // Check email category flags based on Gmail labels
            const isSpam = labels.includes('SPAM')
            const isTrash = labels.includes('TRASH')
            const isDraft = labels.includes('DRAFT')

            // Cache email in database with proper categorization
            await prisma.email.upsert({
              where: {
                providerId_externalId: {
                  providerId: emailProvider.id,
                  externalId: message.id!
                }
              },
              update: {
                subject,
                from,
                to: to ? [to] : [],
                content,
                snippet,
                labels,
                isRead,
                isStarred,
                isImportant,
                isSpam,
                isTrash,
                isDraft,
                receivedAt: new Date(date)
              },
              create: {
                  externalId: message.id!,
                  user: { connect: { id: user.id } },
                  provider: { connect: { id: emailProvider.id } },
                threadId: emailDetail.data.threadId || '',
                subject,
                from,
                to: to ? [to] : [],
                cc: [],
                bcc: [],
                content,
                snippet,
                labels,
                isRead,
                isStarred,
                isImportant,
                isSpam,
                isTrash,
                isDraft,
                receivedAt: new Date(date)
              }
            })

            newEmailsCount++
            console.log(`Cached new email: ${subject}`)

            // Check if this is a self-sent email (from user to themselves)
            const isSelfSent = from.includes(user.email) && (to.includes(user.email) || to === '')
            
            // For self-sent emails in inbox view, display "Me" as sender
            const displayFrom = isSelfSent && labels.includes('INBOX') ? 'Me' : from
            
            return {
              id: message.id!,
              subject,
              from: displayFrom,
              snippet: truncateText(snippet, 100),
              receivedAt: new Date(date).toISOString(),
              isRead,
              isStarred,
              isImportant,
              threadId: emailDetail.data.threadId,
              labelIds: labels,
              labels: labels,
              category: categorizeEmail(labels, isSelfSent)
            }
          } catch (error) {
            console.error(`Error fetching email ${message.id}:`, error)
            return null
          }
        })
      )

      // Filter out any null results
      newEmails = emails.filter((email): email is NonNullable<typeof email> => email !== null)
    }

    // Get cached emails (excluding the newly fetched ones to avoid duplicates)
    const cachedEmails = await getCachedEmails(user.id, user.email, category, maxResults, since, olderThan)
    
    // Create a Set of Gmail IDs from new emails for efficient lookup
    const newEmailIds = new Set(newEmails.map(email => email.id))
    
    // Filter cached emails to exclude any that were just fetched
    const filteredCachedEmails = cachedEmails.filter(email => !newEmailIds.has(email.id))
    
    // Combine new emails with filtered cached emails, sorted by date
    const allEmails = [...newEmails, ...filteredCachedEmails]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, maxResults)
    
    console.log(`Total emails returned: ${allEmails.length} (${newEmailsCount} newly fetched, ${filteredCachedEmails.length} cached)`)

    // Check user preferences for auto-summarization
    const userPreferences = await prisma.userPreferences.findUnique({
      where: { userId: user.id }
    })

    // If autoSummarize is enabled, generate summaries for emails without them
    if (userPreferences?.autoSummarize !== false && newEmails.length > 0) {
      const emailsWithoutSummaries = newEmails.filter(email => !email.summary)
      
      if (emailsWithoutSummaries.length > 0) {
        // Generate summaries in background (don't await to avoid blocking response)
        generateSummariesInBackground(emailsWithoutSummaries, user.id)
      }
    }
    
    // Include pagination token if available
    const pageToken = emailList.data?.nextPageToken
    
    // Simplified pagination logic
    let hasMoreEmails = false
    let nextOlderThan: string | null = null
    
    if (allEmails.length > 0) {
      const oldestEmail = allEmails[allEmails.length - 1]
      const oldestEmailDate = new Date(oldestEmail.date)
      
      // Check if we have the maximum number of results, which suggests there might be more
      const hasMaxResults = allEmails.length >= maxResults
      
      // Set hasMore to true if we have max results, indicating potential for more emails
      hasMoreEmails = hasMaxResults
      
      // Set nextOlderThan to the oldest email's date for the next pagination request
      nextOlderThan = hasMoreEmails ? oldestEmailDate.toISOString() : null
      
      console.log(`Pagination: ${allEmails.length} emails, maxResults: ${maxResults}, hasMore: ${hasMoreEmails}, nextOlderThan: ${nextOlderThan}`)
    } else {
      hasMoreEmails = false
      nextOlderThan = null
      console.log('Pagination: No emails found, hasMore: false')
    }
    
    // Determine cache source
    let cacheSource: 'cache' | 'gmail' | 'mixed'
    if (newEmailsCount === 0) {
      cacheSource = 'cache'
    } else if (allEmails.length === newEmailsCount) {
      cacheSource = 'gmail'
    } else {
      cacheSource = 'mixed'
    }
    
    return NextResponse.json({
      emails: allEmails,
      cacheInfo: {
        source: cacheSource,
        cached: filteredCachedEmails.length,
        newlyFetched: newEmailsCount,
        lastFetched: new Date().toISOString(),
        category
      },
      pagination: {
        hasMore: hasMoreEmails,
        nextOlderThan: nextOlderThan,
        currentPeriod: olderThan ? '30 days' : '60 days'
      },
      nextPageToken: pageToken || null,
      hasMore: !!pageToken || hasMoreEmails,
      fromCache: newEmailsCount === 0,
      newEmailsCount,
      totalCount: allEmails.length
    }, {
      headers: {
        'Cache-Control': newEmailsCount === 0 
          ? 'public, s-maxage=300, stale-while-revalidate=600' 
          : 'public, s-maxage=60, stale-while-revalidate=300'
      }
    })
  } catch (error) {
    console.error('Gmail API error:', error)
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      status: (error as any)?.response?.status || (error as any)?.status || (error as any)?.code,
      hasRefreshToken: !!token?.refreshToken
    })
    
    // Check for 401 errors in various possible locations
    const is401Error = (
      (error as any)?.response?.status === 401 ||
      (error as any)?.status === 401 ||
      (error as any)?.code === 401 ||
      (error instanceof Error && error.message.includes('401'))
    )
    
    if (is401Error && token?.refreshToken) {
      console.log('Token expired, NextAuth will handle refresh automatically on next request')
      return NextResponse.json({ 
        error: 'Authentication expired', 
        message: 'Please refresh the page or sign in again',
        requiresReauth: true 
      }, { status: 401 })
    } else if (is401Error) {
      console.log('No refresh token available, user needs to re-authenticate')
      return NextResponse.json({ 
        error: 'Authentication expired', 
        message: 'Please sign out and sign in again',
        requiresReauth: true 
      }, { status: 401 })
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch emails' },
      { status: 500 }
    )
  }
}

// Background function to generate summaries
async function generateSummariesInBackground(emails: any[], userId: string) {
  try {
    console.log(`Generating summaries for ${emails.length} emails in background`)
    
    // Process emails in batches to avoid overwhelming the API
    const batchSize = 3
    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize)
      
      // Process batch with delay to respect rate limits
      await Promise.all(
        batch.map(async (email, index) => {
          try {
            // Add delay between requests
            await new Promise(resolve => setTimeout(resolve, index * 1000))
            
            // Call the summarization API internally
            await generateEmailSummary(email.id, userId)
          } catch (error) {
            console.error(`Failed to generate summary for email ${email.id}:`, error)
          }
        })
      )
      
      // Delay between batches
      if (i + batchSize < emails.length) {
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    }
  } catch (error) {
    console.error('Error in background summary generation:', error)
  }
}

// Internal function to generate email summary
async function generateEmailSummary(externalId: string, userId: string) {
  try {
    if (!process.env.GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY not configured')
    }

    // Get email from database using Gmail ID
  const cachedEmail = await prisma.email.findFirst({
    where: {
      externalId: externalId,
      userId: userId
    }
  }) as any

    if (!cachedEmail) {
      throw new Error('Email not found in cache')
    }

    // Check if summary already exists using the database email ID
  const existingSummary = await prisma.emailSummary.findFirst({
    where: {
      emailId: cachedEmail.id,
      userId
    }
  }) as any

    if (existingSummary) {
      return existingSummary
    }

    const Groq = require('groq-sdk')
    const groq = new Groq({
      apiKey: process.env.GROQ_API_KEY
    })

    // Generate AI summary using Groq
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'You are an AI assistant that creates concise, helpful email summaries. Provide a brief summary that captures the key points, action items, and important details. Keep it under 150 words.'
        },
        {
          role: 'user',
          content: `Please summarize this email:\n\nSubject: ${cachedEmail.subject}\nFrom: ${cachedEmail.from}\n\nContent:\n${cachedEmail.content}`
        }
      ],
      model: 'llama3-8b-8192',
      temperature: 0.3,
      max_tokens: 200
    })

    const summary = completion.choices[0]?.message?.content || 'Unable to generate summary'

    // Extract key points and action items
    const keyPointsCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'Extract key points and action items from the email. Return as JSON with "keyPoints" and "actionItems" arrays.'
        },
        {
          role: 'user',
          content: `Email content:\n${cachedEmail.content}`
        }
      ],
      model: 'llama3-8b-8192',
      temperature: 0.1,
      max_tokens: 300
    })

    let keyPoints: string[] = []
    let actionItems: string[] = []

    try {
      const parsed = JSON.parse(keyPointsCompletion.choices[0]?.message?.content || '{}')
      keyPoints = parsed.keyPoints || []
      actionItems = parsed.actionItems || []
    } catch (error) {
      console.error('Error parsing key points:', error)
    }

    // Save summary to database
  const emailSummary = await prisma.emailSummary.create({
    data: {
      emailId: cachedEmail.id,
      userId: userId,
      summary,
      keyPoints,
      actionItems,
      sentiment: 'neutral',
      priority: 'medium'
    }
  })

    console.log(`Generated summary for email ${externalId}`)
    return emailSummary
  } catch (error) {
    console.error(`Error generating summary for email ${externalId}:`, error)
    throw error
  }
}