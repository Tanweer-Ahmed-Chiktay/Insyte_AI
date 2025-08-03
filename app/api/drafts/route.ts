import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic'

interface DraftData {
  to: string
  subject: string
  body: string
  attachments?: string[]
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.accessToken) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { to, subject, body, attachments }: DraftData = await request.json()

    // Validate required fields
    if (!body.trim() && (!to || !subject)) {
      return NextResponse.json(
        { error: 'Draft must have content or recipient/subject' },
        { status: 400 }
      )
    }

    // Initialize Gmail API
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    )

    oauth2Client.setCredentials({
      access_token: session.accessToken,
      refresh_token: session.refreshToken
    })

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    // Create email message
    const emailLines = []
    if (to) emailLines.push(`To: ${to}`)
    if (subject) emailLines.push(`Subject: ${subject}`)
    emailLines.push('Content-Type: text/html; charset=utf-8')
    emailLines.push('')
    emailLines.push(body)

    const email = emailLines.join('\n')
    const encodedEmail = Buffer.from(email).toString('base64').replace(/\+/g, '-').replace(/\//g, '_')

    // Create or update draft
    const draftResponse = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: {
        message: {
          raw: encodedEmail
        }
      }
    })

    return NextResponse.json({
      success: true,
      draftId: draftResponse.data.id,
      message: 'Draft saved successfully'
    })

  } catch (error) {
    console.error('Draft save error:', error)
    return NextResponse.json(
      { error: 'Failed to save draft' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.accessToken) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const draftId = searchParams.get('id')

    // Initialize Gmail API
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    )

    oauth2Client.setCredentials({
      access_token: session.accessToken,
      refresh_token: session.refreshToken
    })

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    if (draftId) {
      // Get specific draft
      const draftResponse = await gmail.users.drafts.get({
        userId: 'me',
        id: draftId
      })

      return NextResponse.json({
        success: true,
        draft: draftResponse.data
      })
    } else {
      // List all drafts
      const draftsResponse = await gmail.users.drafts.list({
        userId: 'me',
        maxResults: 50
      })

      return NextResponse.json({
        success: true,
        drafts: draftsResponse.data.drafts || []
      })
    }

  } catch (error) {
    console.error('Draft fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch drafts' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.accessToken) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const draftId = searchParams.get('id')

    if (!draftId) {
      return NextResponse.json(
        { error: 'Draft ID is required' },
        { status: 400 }
      )
    }

    // Initialize Gmail API
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    )

    oauth2Client.setCredentials({
      access_token: session.accessToken,
      refresh_token: session.refreshToken
    })

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    // Delete draft
    await gmail.users.drafts.delete({
      userId: 'me',
      id: draftId
    })

    return NextResponse.json({
      success: true,
      message: 'Draft deleted successfully'
    })

  } catch (error) {
    console.error('Draft delete error:', error)
    return NextResponse.json(
      { error: 'Failed to delete draft' },
      { status: 500 }
    )
  }
}