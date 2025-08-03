import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { google } from 'googleapis'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const token = await getToken({ 
      req: request as any, 
      secret: process.env.NEXTAUTH_SECRET 
    })
    
    if (!token?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { contactName, subject, content, htmlContent } = body

    // Input validation
    if (!contactName || !subject || (!content && !htmlContent)) {
      return NextResponse.json({ 
        error: 'Contact name, subject, and content are required' 
      }, { status: 400 })
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { email: token.email as string }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Find contact by name (case-insensitive)
    const contact = await prisma.contact.findFirst({
      where: {
        userId: user.id,
        name: {
          contains: contactName,
          mode: 'insensitive'
        }
      }
    })

    if (!contact) {
      return NextResponse.json({ 
        error: `Contact '${contactName}' not found` 
      }, { status: 404 })
    }

    // Check for authentication tokens
    if (!token?.accessToken || !token?.refreshToken) {
      return NextResponse.json({ 
        error: 'No access token found. Please sign out and sign in again.' 
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

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    // Prepare email content
    const htmlBody = htmlContent || `<p>${content.replace(/\n/g, '<br>')}</p>`
    
    const emailContent = [
      `From: ${token.email}`,
      `To: ${contact.email}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      '',
      htmlBody
    ].join('\n')

    // Encode email
    const encodedEmail = Buffer.from(emailContent)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    // Send email
    const result = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedEmail
      }
    })

    return NextResponse.json({
      success: true,
      messageId: result.data.id,
      sentTo: {
        name: contact.name,
        email: contact.email
      }
    })

  } catch (error) {
    console.error('Send email to contact error:', error)
    
    // Handle authentication errors
    if (error && typeof error === 'object' && 'code' in error && error.code === 401) {
      return NextResponse.json({ 
        error: 'Authentication expired', 
        message: 'Please sign out and sign in again',
        requiresReauth: true 
      }, { status: 401 })
    }
    
    return NextResponse.json(
      { error: 'Failed to send email' },
      { status: 500 }
    )
  }
}