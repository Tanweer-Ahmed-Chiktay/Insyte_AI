import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { google } from 'googleapis'
import { prisma } from '@/lib/prisma'
import { truncateText } from '@/lib/utils'
import { safeUpsert, safeFindFirst, safeCreate, safeFindMany } from '@/lib/prisma-wrapper'

export const runtime = "nodejs"
// Force dynamic rendering for this route
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Helper function to categorize emails based on Gmail labels
function categorizeEmail(labels: string[]): string {
  if (labels.includes('SENT')) return 'sent'
  if (labels.includes('DRAFT')) return 'draft'
  if (labels.includes('SPAM')) return 'spam'
  if (labels.includes('TRASH')) return 'trash'
  if (labels.includes('CATEGORY_SOCIAL')) return 'social'
  if (labels.includes('CATEGORY_PROMOTIONS')) return 'promotions'
  if (labels.includes('CATEGORY_UPDATES')) return 'updates'
  if (labels.includes('CATEGORY_FORUMS')) return 'forums'
  if (labels.includes('INBOX')) return 'primary'
  return 'other'
}

export async function GET(request: NextRequest) {
  let token: any = null
  
  try {
    // Get query parameters for incremental fetching
    const { searchParams } = request.nextUrl
    const since = searchParams.get('since') // ISO date string for incremental fetching
    const maxResults = parseInt(searchParams.get('maxResults') || '50')
    const category = searchParams.get('category') || 'inbox'
    
    // Debug: Check cookies
    const cookies = request.headers.get('cookie')
    console.log('Request cookies:', cookies)
    
    // Get JWT token which contains access and refresh tokens
    // Cast request to any for Next.js 14+ compatibility
    token = await getToken({ 
      req: request as any, 
      secret: process.env.NEXTAUTH_SECRET 
    })
    
    console.log('Token check:', {
      hasToken: !!token,
      userEmail: token?.email,
      hasAccessToken: !!token?.accessToken,
      hasRefreshToken: !!token?.refreshToken
    })
    
    if (!token?.email) {
      console.error('No token or user email found')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!token?.accessToken) {
      console.error('No access token found for user')
      return NextResponse.json({ error: 'No access token found' }, { status: 401 })
    }
    
    // Check if we have a refresh token - if not, user needs to re-authenticate
    if (!token?.refreshToken) {
      console.error('No refresh token found - user needs to re-authenticate')
      return NextResponse.json({ 
        error: 'Authentication expired', 
        message: 'Please sign out and sign in again to refresh your Gmail access',
        requiresReauth: true 
      }, { status: 401 })
    }

    // Initialize Gmail API
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    )

    oauth2Client.setCredentials({
      access_token: token.accessToken as string,
      refresh_token: token.refreshToken as string
    })

    // Note: With JWT sessions, token refresh is handled by NextAuth automatically
    // The tokens will be refreshed in the JWT callback when needed

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
    
    if (since) {
      const sinceDate = new Date(since)
      const formattedDate = sinceDate.toISOString().split('T')[0].replace(/-/g, '/')
      query += ` after:${formattedDate}`
    }
    
    console.log('Gmail query:', query)
    
    // Ensure user exists in database
    const user = await safeUpsert(prisma.user, {
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
    }, 'user-upsert') as any
    
    // Get email list
    const emailList = await gmail.users.messages.list({
      userId: 'me',
      maxResults,
      q: query
    })

    if (!emailList.data.messages) {
      return NextResponse.json([])
    }

    // Get detailed information for each email
    const emails = await Promise.all(
      emailList.data.messages.slice(0, 20).map(async (message) => {
        try {
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
          await safeUpsert(prisma.email, {
            where: {
              gmailId: message.id!
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
              gmailId: message.id!,
              userId: user.id,
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
          }, 'email-upsert')

          return {
            id: message.id!,
            subject,
            from,
            snippet: truncateText(snippet, 100),
            date: new Date(date).toISOString(),
            isRead,
            isStarred,
            isImportant,
            threadId: emailDetail.data.threadId,
            labelIds: labels,
            labels: labels,
            category: categorizeEmail(labels)
          }
        } catch (error) {
          console.error(`Error fetching email ${message.id}:`, error)
          return null
        }
      })
    )

    // Filter out any null results
    const validEmails = emails.filter(email => email !== null)

    // Get existing summaries for these emails
    const emailIds = validEmails.map(email => email.id)
    const existingSummaries = await safeFindMany(prisma.emailSummary, {
      where: {
        email: {
          gmailId: {
            in: emailIds
          }
        },
        userId: user.id
      },
      include: {
        email: true
      }
    }, 'emailSummary-findMany') as any[]

    // Create a map of gmailId to summary for quick lookup
    const summaryMap = new Map<string, any>()
    existingSummaries.forEach((summary: any) => {
      summaryMap.set(summary.email.gmailId, {
        id: summary.id,
        summary: summary.summary,
        sentiment: summary.sentiment,
        priority: summary.priority,
        category: summary.category,
        keyPoints: summary.keyPoints,
        actionItems: summary.actionItems,
        createdAt: summary.createdAt.toISOString(),
        updatedAt: summary.updatedAt.toISOString()
      })
    })

    // Add summary data to emails
    const emailsWithSummaries = validEmails.map(email => ({
      ...email,
      summary: summaryMap.get(email.id) || null
    }))

    // Check user preferences for auto-summarization
    const userPreferences = await prisma.userPreferences.findUnique({
      where: { userId: user.id }
    })

    // If autoSummarize is enabled, generate summaries for emails without them
    if (userPreferences?.autoSummarize !== false) {
      const emailsWithoutSummaries = emailsWithSummaries.filter(email => !email.summary)
      
      if (emailsWithoutSummaries.length > 0) {
        // Generate summaries in background (don't await to avoid blocking response)
        generateSummariesInBackground(emailsWithoutSummaries, user.id)
      }
    }

    console.log(`Fetched ${emailsWithSummaries.length} emails for user`)
    
    // Include pagination token if available
    const pageToken = emailList.data.nextPageToken
    
    return NextResponse.json({
      emails: emailsWithSummaries,
      nextPageToken: pageToken || null,
      hasMore: !!pageToken
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
async function generateEmailSummary(gmailId: string, userId: string) {
  try {
    if (!process.env.GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY not configured')
    }

    // Get email from database using Gmail ID
    const cachedEmail = await safeFindFirst(prisma.email, {
      where: {
        gmailId: gmailId,
        userId: userId
      }
    }, 'email-lookup') as any

    if (!cachedEmail) {
      throw new Error('Email not found in cache')
    }

    // Check if summary already exists using the database email ID
    const existingSummary = await safeFindFirst(prisma.emailSummary, {
      where: {
        emailId: cachedEmail.id,
        userId
      }
    }, 'summary-lookup') as any

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
    const emailSummary = await safeCreate(prisma.emailSummary, {
      data: {
        emailId: cachedEmail.id,
        userId: userId,
        summary,
        keyPoints,
        actionItems,
        sentiment: 'neutral',
        priority: 'medium'
      }
    }, 'summary-create')

    console.log(`Generated summary for email ${gmailId}`)
    return emailSummary
  } catch (error) {
    console.error(`Error generating summary for email ${gmailId}:`, error)
    throw error
  }
}