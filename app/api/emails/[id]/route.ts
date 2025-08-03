import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { google } from 'googleapis'

export const runtime = "nodejs"

interface EmailPart {
  mimeType?: string
  body?: {
    data?: string
    attachmentId?: string
    size?: number
  }
  parts?: EmailPart[]
  headers?: Array<{ name?: string; value?: string }>
  filename?: string
}

function extractEmailContent(payload: any): { htmlBody: string; textBody: string; attachments: any[] } {
  let htmlBody = ''
  let textBody = ''
  const attachments: any[] = []

  function traverseParts(part: EmailPart) {
    if (part.mimeType === 'text/html' && part.body?.data) {
      htmlBody += Buffer.from(part.body.data, 'base64').toString('utf-8')
    } else if (part.mimeType === 'text/plain' && part.body?.data) {
      textBody += Buffer.from(part.body.data, 'base64').toString('utf-8')
    } else if (part.filename && part.body?.attachmentId) {
      attachments.push({
        filename: part.filename,
        mimeType: part.mimeType,
        attachmentId: part.body.attachmentId,
        size: part.body.size
      })
    }

    if (part.parts) {
      part.parts.forEach(traverseParts)
    }
  }

  // Handle single part emails
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    htmlBody = Buffer.from(payload.body.data, 'base64').toString('utf-8')
  } else if (payload.mimeType === 'text/plain' && payload.body?.data) {
    textBody = Buffer.from(payload.body.data, 'base64').toString('utf-8')
  } else if (payload.parts) {
    payload.parts.forEach(traverseParts)
  }

  return { htmlBody, textBody, attachments }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  let token = null
  
  try {
    // Cast request to any for Next.js 14+ compatibility
    token = await getToken({ 
      req: request as any, 
      secret: process.env.NEXTAUTH_SECRET 
    })
    
    if (!token) {
      return NextResponse.json({ error: 'No token found' }, { status: 401 })
    }

    if (!token.accessToken) {
      return NextResponse.json({ error: 'No access token' }, { status: 401 })
    }

    if (!token.refreshToken) {
      return NextResponse.json({ error: 'No refresh token' }, { status: 401 })
    }

    // Set up OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.NEXTAUTH_URL
    )

    oauth2Client.setCredentials({
      access_token: token.accessToken as string,
      refresh_token: token.refreshToken as string,
    })

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    // Get full email details
    const emailDetail = await gmail.users.messages.get({
      userId: 'me',
      id: params.id,
      format: 'full'
    })

    const headers = emailDetail.data.payload?.headers || []
    const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject'
    const from = headers.find(h => h.name === 'From')?.value || 'Unknown Sender'
    const to = headers.find(h => h.name === 'To')?.value || ''
    const date = headers.find(h => h.name === 'Date')?.value || new Date().toISOString()
    
    // Extract email content
    const { htmlBody, textBody, attachments } = extractEmailContent(emailDetail.data.payload)
    
    // Check email status
    const isRead = !emailDetail.data.labelIds?.includes('UNREAD')
    const isStarred = emailDetail.data.labelIds?.includes('STARRED') || false
    const isImportant = emailDetail.data.labelIds?.includes('IMPORTANT') || false

    return NextResponse.json({
      id: params.id,
      subject,
      from,
      to,
      date: new Date(date).toISOString(),
      htmlBody,
      textBody,
      attachments,
      isRead,
      isStarred,
      isImportant,
      threadId: emailDetail.data.threadId,
      labelIds: emailDetail.data.labelIds || []
    })
  } catch (error) {
    console.error('Gmail API error:', error)
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      status: (error as any)?.response?.status || (error as any)?.status || (error as any)?.code,
      hasRefreshToken: !!token?.refreshToken
    })
    
    // Check for 401 errors
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
      { error: 'Failed to fetch email details' },
      { status: 500 }
    )
  }
}