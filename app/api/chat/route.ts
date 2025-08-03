import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getToken } from 'next-auth/jwt'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getJson } from 'serpapi'
import { safeFindUnique, safeFindMany, safeCreate } from '@/lib/prisma-wrapper'

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const revalidate = 0

const GROQ_API_KEY = process.env.GROQ_API_KEY
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY
const SERPAPI_KEY = process.env.SERPAPI_API_KEY

// Email summary cache (in-memory for this session)
const emailSummaryCache = new Map<string, { summary: string, timestamp: number }>()
const CACHE_DURATION = 30 * 60 * 1000 // 30 minutes

// Generate cache key for email summaries
function generateEmailCacheKey(emails: EmailForContext[]): string {
  return emails.map(email => `${email.subject}-${email.from}-${email.date}`).join('|')
}

// Helper function to detect if the message is email-related
function isEmailRelatedQuery(message: string): boolean {
  const emailKeywords = [
    'email', 'emails', 'inbox', 'message', 'messages', 'mail',
    'sender', 'subject', 'unread', 'starred', 'important',
    'received', 'sent', 'reply', 'forward', 'attachment',
    'thread', 'conversation', 'gmail', 'compose',
    'primary', 'social', 'promotions', 'updates', 'forums',
    'contact', 'contacts', 'send email to'
  ]
  
  const lowerMessage = message.toLowerCase()
  return emailKeywords.some(keyword => lowerMessage.includes(keyword))
}

// Helper function to detect if the message is about sending email to a contact
function isSendEmailToContactQuery(message: string): boolean {
  const lowerMessage = message.toLowerCase()
  return lowerMessage.includes('send email to') || 
         lowerMessage.includes('email to') ||
         (lowerMessage.includes('send') && lowerMessage.includes('contact'))
}

// Helper function to detect if the message requires web search
function isWebSearchQuery(message: string): boolean {
  const webSearchKeywords = [
    'search for', 'look up', 'find information about', 'what is', 'who is',
    'when did', 'where is', 'how to', 'latest news', 'current', 'recent',
    'weather', 'stock price', 'news about', 'information on', 'tell me about',
    'search the web', 'google', 'find out', 'research', 'lookup'
  ]
  
  const lowerMessage = message.toLowerCase()
  return webSearchKeywords.some(keyword => lowerMessage.includes(keyword)) ||
         (!isEmailRelatedQuery(message) && !isSendEmailToContactQuery(message))
}

// Helper function to perform web search using SerpAPI
async function performWebSearch(query: string): Promise<string> {
  if (!SERPAPI_KEY) {
    return 'Web search is not configured. Please set up SERPAPI_API_KEY.'
  }

  try {
    const searchResults = await getJson({
      engine: 'google',
      q: query,
      api_key: SERPAPI_KEY,
      num: 5 // Get top 5 results
    })

    if (!searchResults.organic_results || searchResults.organic_results.length === 0) {
      return 'No search results found for your query.'
    }

    // Format search results for AI context
    let formattedResults = 'Here are the search results:\n\n'
    
    searchResults.organic_results.slice(0, 3).forEach((result: any, index: number) => {
      formattedResults += `${index + 1}. **${result.title}**\n`
      formattedResults += `   ${result.snippet}\n`
      formattedResults += `   Source: ${result.link}\n\n`
    })

    return formattedResults
  } catch (error) {
    console.error('Web search error:', error)
    return 'Sorry, I encountered an error while searching the web. Please try again later.'
  }
}

// Helper function to extract contact name and email details from message
function extractEmailToContactDetails(message: string): { contactName?: string, subject?: string, content?: string } {
  const lowerMessage = message.toLowerCase()
  
  // Extract contact name (after "send email to" or "email to")
  let contactName: string | undefined
  const sendToMatch = message.match(/send email to ([^\s,]+)/i)
  const emailToMatch = message.match(/email to ([^\s,]+)/i)
  
  if (sendToMatch) {
    contactName = sendToMatch[1]
  } else if (emailToMatch) {
    contactName = emailToMatch[1]
  }
  
  // Extract subject (after "subject" or "with subject")
  let subject: string | undefined
  const subjectMatch = message.match(/(?:subject|with subject)[:\s]+["']?([^"'\n]+)["']?/i)
  if (subjectMatch) {
    subject = subjectMatch[1].trim()
  }
  
  // Extract content (after "content" or "message" or "body")
  let content: string | undefined
  const contentMatch = message.match(/(?:content|message|body)[:\s]+["']?([^"'\n]+)["']?/i)
  if (contentMatch) {
    content = contentMatch[1].trim()
  }
  
  return { contactName, subject, content }
}

// Helper function to extract category from user message
function extractCategoryFromMessage(message: string): string | undefined {
  const lowerMessage = message.toLowerCase()
  
  if (lowerMessage.includes('social')) return 'social'
  if (lowerMessage.includes('promotion')) return 'promotions'
  if (lowerMessage.includes('update')) return 'updates'
  if (lowerMessage.includes('forum')) return 'forums'
  if (lowerMessage.includes('primary') || lowerMessage.includes('main inbox')) return 'primary'
  if (lowerMessage.includes('sent')) return 'sent'
  if (lowerMessage.includes('draft')) return 'draft'
  if (lowerMessage.includes('starred')) return 'starred'
  if (lowerMessage.includes('important')) return 'important'
  if (lowerMessage.includes('unread')) return 'unread'
  
  return undefined
}

interface EmailForContext {
  subject: string
  from: string
  snippet: string
  date: string
  isRead: boolean
  isStarred: boolean
  isImportant: boolean
  labels: string[]
  category: string
  summary?: any
}

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

// Helper function to fetch user's emails from database
async function fetchUserEmails(request: NextRequest, category?: string) {
  try {
    const session = await getServerSession({ req: request, ...authOptions })
    
    if (!session?.user?.email) {
      return null
    }

    // Get user from database
    const user = await safeFindUnique(prisma.user, {
      where: { email: session.user.email }
    }, 'user-lookup') as any

    if (!user) {
      return null
    }

    // Build where clause based on category filter
     let whereClause: any = {
       userId: user.id,
       isTrash: false,
       isSpam: false
     }

     // Add category-specific filters
     if (category) {
       switch (category.toLowerCase()) {
         case 'sent':
           whereClause.labels = { has: 'SENT' }
           break
         case 'draft':
           whereClause.isDraft = true
           break
         case 'social':
           whereClause.labels = { has: 'CATEGORY_SOCIAL' }
           break
         case 'promotions':
           whereClause.labels = { has: 'CATEGORY_PROMOTIONS' }
           break
         case 'updates':
           whereClause.labels = { has: 'CATEGORY_UPDATES' }
           break
         case 'forums':
           whereClause.labels = { has: 'CATEGORY_FORUMS' }
           break
         case 'primary':
           whereClause.labels = { has: 'INBOX' }
           whereClause.AND = [
             { labels: { none: ['CATEGORY_SOCIAL', 'CATEGORY_PROMOTIONS', 'CATEGORY_UPDATES', 'CATEGORY_FORUMS'] } }
           ]
           break
         case 'starred':
           whereClause.isStarred = true
           break
         case 'important':
           whereClause.isImportant = true
           break
         case 'unread':
           whereClause.isRead = false
           break
       }
     }

     // Get recent emails from database
     const emails = await safeFindMany(prisma.email, {
       where: whereClause,
       orderBy: {
         receivedAt: 'desc'
       },
       take: 10,
       include: {
         summary: true
       }
     }, 'emails-lookup') as any[]

    // Transform database emails to the expected format
      return emails.map((email: any) => ({
        subject: email.subject,
        from: email.from,
        snippet: email.snippet?.substring(0, 200) || '',
        date: email.receivedAt.toISOString(),
        isRead: email.isRead,
        isStarred: email.isStarred,
        isImportant: email.isImportant,
        labels: email.labels || [],
        category: categorizeEmail(email.labels || []),
        summary: email.summary
      })) as EmailForContext[]
  } catch (error) {
    console.error('Error fetching emails for chat context:', error)
    return null
  }
}

function formatEmailsForContext(emails: EmailForContext[]): string {
  if (!emails || emails.length === 0) {
    return 'No emails found.'
  }
  
  // Limit to first 3 emails to prevent context overflow
  const limitedEmails = emails.slice(0, 3)
  
  return limitedEmails.map((email: EmailForContext, index: number) => {
    const snippet = email.snippet.length > 80 ? email.snippet.substring(0, 80) + '...' : email.snippet
    return `${index + 1}. ${email.subject} (${email.from}) - ${email.category} - ${snippet}`
  }).join('\n')
}

// Helper function to get recent conversation history
async function getConversationHistory(userId: string, limit: number = 3) {
  try {
    const recentMessages = await safeFindMany(prisma.chatMessage, {
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit * 2, // Get more to account for user/assistant pairs
      select: {
        role: true,
        content: true,
        createdAt: true
      }
    }, 'chat-history') as any[]
    
    // Reverse to get chronological order and format for Groq API
    return recentMessages
      .reverse()
      .map((msg: { role: string; content: string; createdAt: Date }) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content.length > 500 ? msg.content.substring(0, 500) + '...' : msg.content // Truncate long messages
      }))
  } catch (error) {
    console.error('Error fetching conversation history:', error)
    return []
  }
}

// Helper function to store chat message
async function storeChatMessage(userId: string, role: 'user' | 'assistant', content: string, emailId?: string) {
  try {
    await safeCreate(prisma.chatMessage, {
      data: {
        userId,
        role,
        content,
        emailId
      }
    }, 'chat-message-create')
  } catch (error) {
    console.error('Error storing chat message:', error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession({ req: request, ...authOptions })
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { message, includeVoice = false } = await request.json()

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // Check if GROQ_API_KEY is available
    if (!GROQ_API_KEY) {
      console.error('GROQ_API_KEY is not configured')
      return NextResponse.json({ error: 'AI service not configured' }, { status: 500 })
    }

    const userId = session.user?.email ? 
      (await safeFindUnique(prisma.user, { where: { email: session.user.email } }, 'user-lookup') as any)?.id : 
      null
    
    if (!userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Store the user message
    await storeChatMessage(userId, 'user', message)

    // Check if this is a request to send email to a contact
    if (isSendEmailToContactQuery(message)) {
      const { contactName, subject, content } = extractEmailToContactDetails(message)
      
      if (contactName && subject && content) {
        try {
           // Call the send-email-to-contact API
           const baseUrl = process.env.NEXTAUTH_URL || request.nextUrl.origin
           const sendEmailResponse = await fetch(`${baseUrl}/api/send-email-to-contact`, {
             method: 'POST',
             headers: {
               'Content-Type': 'application/json',
               'Cookie': request.headers.get('cookie') || '',
             },
             body: JSON.stringify({
               contactName,
               subject,
               content
             })
           })
          
          if (sendEmailResponse.ok) {
            const result = await sendEmailResponse.json()
            const successMessage = `Email sent successfully to ${contactName}! Subject: "${subject}"`
            await storeChatMessage(userId, 'assistant', successMessage)
            
            return NextResponse.json({
              response: successMessage,
              audioUrl: null
            })
          } else {
            const error = await sendEmailResponse.json()
            const errorMessage = `Failed to send email to ${contactName}: ${error.error || 'Unknown error'}`
            await storeChatMessage(userId, 'assistant', errorMessage)
            
            return NextResponse.json({
              response: errorMessage,
              audioUrl: null
            })
          }
        } catch (error) {
          console.error('Error sending email to contact:', error)
          const errorMessage = `Sorry, I encountered an error while trying to send the email to ${contactName}.`
          await storeChatMessage(userId, 'assistant', errorMessage)
          
          return NextResponse.json({
            response: errorMessage,
            audioUrl: null
          })
        }
      } else {
        const helpMessage = `To send an email to a contact, please provide the contact name, subject, and content. For example: "Send email to John with subject 'Meeting Tomorrow' and content 'Hi John, let's meet tomorrow at 2 PM.'"`
        await storeChatMessage(userId, 'assistant', helpMessage)
        
        return NextResponse.json({
          response: helpMessage,
          audioUrl: null
        })
      }
    }

    // Get conversation history for context
    const conversationHistory = await getConversationHistory(userId, 1) // Last 1 exchange to prevent context overflow

    // Check if the query requires web search
    let webSearchContext = ''
    if (isWebSearchQuery(message) && !isEmailRelatedQuery(message)) {
      console.log('Performing web search for:', message)
      webSearchContext = await performWebSearch(message)
    }

    // Check if the query is email-related and fetch emails if needed
    let emailContext = ''
    if (isEmailRelatedQuery(message)) {
      // Extract category from user message if specified
      const category = extractCategoryFromMessage(message)
      const emails = await fetchUserEmails(request, category)
      if (emails && emails.length > 0) {
        // Check cache for email summary
        const cacheKey = generateEmailCacheKey(emails)
        const cached = emailSummaryCache.get(cacheKey)
        
        if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
          emailContext = cached.summary
          console.log('Using cached email summary')
        } else {
          // Generate new email summary using the formatEmailsForContext function
           emailContext = `\n\nHere are the user's recent emails for context:\n${formatEmailsForContext(emails)}`
          
          // Cache the email summary
          emailSummaryCache.set(cacheKey, {
            summary: emailContext,
            timestamp: Date.now()
          })
          console.log('Generated and cached new email summary')
        }
      }
    }

    // Build messages array with system prompt, conversation history, and current message
    const messages = [
      {
        role: 'system' as const,
        content: `You are InSyte AI, an intelligent assistant that helps with email management and general information queries. Be helpful, accurate, and concise.

You can:
- Access and manage emails by category (primary, social, promotions, sent, etc.)
- Send emails to contacts by name using: "Send email to [contact name] with subject '[subject]' and content '[message content]'"
- Search the web for current information, news, weather, and general knowledge
- Help with research, fact-checking, and answering questions
- Maintain conversation context and provide follow-up responses

When users ask follow-up questions like "yes" or "show me more", refer to previous messages.${emailContext ? '\n\nEmails:\n' + emailContext : ''}${webSearchContext ? '\n\nWeb Search Results:\n' + webSearchContext : ''}`
      },
      // Include recent conversation history (excluding the current message since we'll add it separately)
      ...conversationHistory.slice(0, -1), // Remove the last message since it's the current user message we just stored
      {
        role: 'user' as const,
        content: message
      }
    ]

    // Call Groq API for text response
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages,
        max_tokens: 1000,
        temperature: 0.7
      })
    })

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text()
      console.error('Groq API error:', groqResponse.status, errorText)
      
      // Handle specific error cases
      if (groqResponse.status === 429) {
        return NextResponse.json(
          { error: 'Rate limit exceeded. Please try again in a moment.' },
          { status: 429 }
        )
      }
      
      if (groqResponse.status === 401) {
        return NextResponse.json(
          { error: 'AI service authentication failed. Please check configuration.' },
          { status: 500 }
        )
      }
      
      throw new Error(`Groq API error: ${groqResponse.status} - ${errorText}`)
    }

    const groqData = await groqResponse.json()
    const textResponse = groqData.choices[0]?.message?.content || 'Sorry, I could not generate a response.'

    // Store the assistant's response
    await storeChatMessage(userId, 'assistant', textResponse)

    let audioUrl = null

    // Generate voice response if requested
    if (includeVoice) {
      try {
        // Use the voice synthesize API which handles ElevenLabs and browser TTS fallback
        const baseUrl = process.env.NEXTAUTH_URL || request.nextUrl.origin
        const voiceResponse = await fetch(`${baseUrl}/api/voice/synthesize`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            text: textResponse
          })
        })

        if (voiceResponse.ok) {
          const contentType = voiceResponse.headers.get('content-type')
          
          // Check if response is JSON (browser TTS fallback)
          if (contentType?.includes('application/json')) {
            const data = await voiceResponse.json()
            
            if (data.useBrowserTTS) {
              // Return special flag for client to use browser TTS
              audioUrl = 'USE_BROWSER_TTS'
            }
          } else {
            // Handle audio blob response (ElevenLabs)
            const audioBuffer = await voiceResponse.arrayBuffer()
            const base64Audio = Buffer.from(audioBuffer).toString('base64')
            audioUrl = `data:audio/mpeg;base64,${base64Audio}`
          }
        }
      } catch (voiceError) {
        console.error('Voice generation error:', voiceError)
        // Set flag for client to use browser TTS as fallback
        audioUrl = 'USE_BROWSER_TTS'
      }
    }

    return NextResponse.json({
      response: textResponse,
      audioUrl
    })

  } catch (error) {
    console.error('Chat API error:', error)
    
    // Handle specific database connection errors
    if (error instanceof Error) {
      if (error.message.includes('prepared statement') || error.message.includes('ConnectorError')) {
        return NextResponse.json(
          { error: 'Database connection issue. Please try again in a moment.' },
          { status: 503 }
        )
      }
    }
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}