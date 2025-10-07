import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { google } from 'googleapis'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { emailIds, category = 'inbox' } = await request.json()
    
    if (!emailIds || !Array.isArray(emailIds) || emailIds.length === 0) {
      return NextResponse.json({ error: 'Email IDs are required' }, { status: 400 })
    }

    // Get user's Gmail access token
    const account = await prisma.account.findFirst({
      where: {
        userId: session.user.id,
        provider: 'google'
      }
    })

    if (!account?.access_token) {
      return NextResponse.json({ error: 'Gmail account not connected' }, { status: 400 })
    }

    // Set up Gmail API
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    )

    oauth2Client.setCredentials({
      access_token: account.access_token,
      refresh_token: account.refresh_token
    })

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    // Fetch emails by their IDs
    const emails = []
    
    for (const emailId of emailIds.slice(0, 10)) { // Limit to 10 emails for performance
      try {
        const messageResponse = await gmail.users.messages.get({
          userId: 'me',
          id: emailId,
          format: 'full'
        })

        const message = messageResponse.data
        if (!message) continue

        // Parse email data
        const headers = message.payload?.headers || []
        const getHeader = (name: string) => headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || ''

        const email = {
          id: message.id!,
          gmailId: message.id!,
          threadId: message.threadId,
          subject: getHeader('Subject'),
          from: getHeader('From'),
          to: [getHeader('To')],
          snippet: message.snippet || '',
          isRead: !message.labelIds?.includes('UNREAD'),
          isStarred: message.labelIds?.includes('STARRED') || false,
          isImportant: message.labelIds?.includes('IMPORTANT') || false,
          labels: message.labelIds || [],
          labelIds: message.labelIds || [],
          receivedAt: new Date(parseInt(message.internalDate || '0')).toISOString(),
          category: category
        }

        emails.push(email)
      } catch (error) {
        console.error(`Failed to fetch email ${emailId}:`, error)
        // Continue with other emails
      }
    }

    return NextResponse.json({ 
      emails,
      count: emails.length,
      requestedCount: emailIds.length
    })

  } catch (error) {
    console.error('Error fetching emails by IDs:', error)
    return NextResponse.json(
      { error: 'Failed to fetch emails' },
      { status: 500 }
    )
  }
}