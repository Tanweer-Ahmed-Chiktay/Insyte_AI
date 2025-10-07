import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import Groq from 'groq-sdk'
import { prisma } from '@/lib/prisma'

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const revalidate = 0
// Removed prisma-wrapper - using prisma directly

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
})

export async function POST(request: NextRequest) {
  let account: any = null
  
  try {
    // Get JWT token which contains access and refresh tokens
    // Cast request to any for Next.js 14+ compatibility
    const token = await getToken({ 
      req: request as any, 
      secret: process.env.NEXTAUTH_SECRET 
    })
    
    if (!token?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({ error: 'AI service not configured' }, { status: 500 })
    }

    const { emailId } = await request.json()

    // Input validation
    if (!emailId || typeof emailId !== 'string') {
      return NextResponse.json({ error: 'Valid email ID is required' }, { status: 400 })
    }

    if (!token?.accessToken) {
      return NextResponse.json({ error: 'No access token found' }, { status: 401 })
    }

    if (!token?.refreshToken) {
      return NextResponse.json({ error: 'No refresh token found' }, { status: 401 })
    }

    // Get user to find their emails with retry logic
  const user = await prisma.user.findUnique({
    where: { email: token.email }
  }) as { id: string; email: string } | null

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 })
    }

    // Get email content from database (cached)
  const cachedEmail = await prisma.email.findFirst({
    where: {
      externalId: emailId,
      userId: user.id
    }
  }) as any

    if (!cachedEmail) {
      return NextResponse.json({ error: 'Email not found in cache. Please refresh your emails first.' }, { status: 404 })
    }

    // Check if summary already exists using the database email ID
  const existingSummary = await prisma.emailSummary.findFirst({
    where: {
      emailId: cachedEmail.id,
      userId: user.id
    }
  }) as any

    if (existingSummary) {
      return NextResponse.json({ summary: existingSummary })
    }

    const emailContent = cachedEmail.content
    const emailSubject = cachedEmail.subject
    const emailFrom = cachedEmail.from

    // Generate AI summary using Groq
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'You are an AI assistant that creates concise, helpful email summaries. Provide a brief summary that captures the key points, action items, and important details. Keep it under 150 words.'
        },
        {
          role: 'user',
          content: `Please summarize this email:\n\nSubject: ${emailSubject}\nFrom: ${emailFrom}\n\nContent:\n${emailContent}`
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
          content: `Email content:\n${emailContent}`
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
      userId: user.id,
      summary,
      keyPoints,
      actionItems,
      sentiment: 'neutral', // Could be enhanced with sentiment analysis
      priority: 'medium'
    }
  })

    return NextResponse.json({ summary: emailSummary })
  } catch (error) {
    console.error('Error generating summary:', error)
    
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
      { error: 'Failed to generate summary' },
      { status: 500 }
    )
  }
}