import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { google } from 'googleapis'
import { prisma } from '@/lib/prisma'
import { autoConvertMarkdown } from '@/lib/markdown-to-html'

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const revalidate = 0
// Removed prisma-wrapper - using prisma directly

export async function POST(request: NextRequest) {
  try {
    // Cast request to any for Next.js 14+ compatibility
    const token = await getToken({ 
      req: request as any, 
      secret: process.env.NEXTAUTH_SECRET 
    })
    
    if (!token?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const to = formData.get('to') as string
    const subject = formData.get('subject') as string
    const rawHtmlBody = formData.get('htmlBody') as string
    const attachmentCount = parseInt(formData.get('attachmentCount') as string || '0')
    const scheduledAt = formData.get('scheduledAt') as string
    
    // Auto-convert Markdown to HTML with syntax highlighting if needed
    const htmlBody = await autoConvertMarkdown(rawHtmlBody)

    // Input validation
    if (!to || !subject || !htmlBody) {
      return NextResponse.json({ error: 'To, subject, and body are required' }, { status: 400 })
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(to)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
    }

    // Length validation
    if (subject.length > 200 || htmlBody.length > 50000) {
      return NextResponse.json({ error: 'Subject or body too long' }, { status: 400 })
    }

    // Collect attachments
    const attachments: Array<{ filename: string; content: Buffer; mimeType: string }> = []
    for (let i = 0; i < attachmentCount; i++) {
      const file = formData.get(`attachment_${i}`) as File
      if (file) {
        const buffer = Buffer.from(await file.arrayBuffer())
        attachments.push({
          filename: file.name,
          content: buffer,
          mimeType: file.type || 'application/octet-stream'
        })
      }
    }

    // Handle scheduled emails
    if (scheduledAt) {
      const scheduledDate = new Date(scheduledAt)
      
      // Validate scheduled date is in the future
      if (scheduledDate <= new Date()) {
        return NextResponse.json({ error: 'Scheduled time must be in the future' }, { status: 400 })
      }

      // Get user ID from database
    const user = await prisma.user.findUnique({
      where: { email: token.email as string }
    }) as any

      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      }

      // Store scheduled email in database
    const scheduledEmail = await prisma.scheduledEmail.create({
      data: {
        userId: user.id,
        to,
        subject,
        htmlBody,
          attachments: attachments.length > 0 ? attachments.map(att => ({
            filename: att.filename,
            content: att.content.toString('base64'),
            mimeType: att.mimeType
          })) : undefined,
          scheduledAt: scheduledDate
        }
      }) as any

      return NextResponse.json({
        success: true,
        scheduled: true,
        scheduledEmailId: scheduledEmail.id,
        scheduledAt: scheduledDate.toISOString()
      })
    }

    if (!token?.accessToken) {
      return NextResponse.json({ error: 'No access token found' }, { status: 401 })
    }

    if (!token?.refreshToken) {
      return NextResponse.json({ error: 'No refresh token found' }, { status: 401 })
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

    // Token refresh is handled automatically by NextAuth with JWT strategy

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    // Create email message with attachments support
    const boundary = `boundary_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    let emailContent = [
      `From: ${token.email}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0'
    ]

    if (attachments.length > 0) {
      // Multipart email with attachments
      emailContent.push(`Content-Type: multipart/mixed; boundary="${boundary}"`)
      emailContent.push('')
      emailContent.push(`--${boundary}`)
      emailContent.push('Content-Type: text/html; charset=utf-8')
      emailContent.push('Content-Transfer-Encoding: 7bit')
      emailContent.push('')
      emailContent.push(htmlBody)
      
      // Add attachments
      for (const attachment of attachments) {
        emailContent.push('')
        emailContent.push(`--${boundary}`)
        emailContent.push(`Content-Type: ${attachment.mimeType}; name="${attachment.filename}"`)
        emailContent.push('Content-Transfer-Encoding: base64')
        emailContent.push(`Content-Disposition: attachment; filename="${attachment.filename}"`)
        emailContent.push('')
        emailContent.push(attachment.content.toString('base64'))
      }
      
      emailContent.push('')
      emailContent.push(`--${boundary}--`)
    } else {
      // Simple HTML email
      emailContent.push('Content-Type: text/html; charset=utf-8')
      emailContent.push('')
      emailContent.push(htmlBody)
    }
    
    const finalEmailContent = emailContent.join('\n')

    // Encode email
    const encodedEmail = Buffer.from(finalEmailContent)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    // Send email
    console.log('Attempting to send email to:', to)
    console.log('From:', token.email)
    const result = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedEmail
      }
    })
    console.log('Gmail API response:', result.data)
    console.log('Email send result - ID:', result.data.id, 'ThreadID:', result.data.threadId)

    // Store sent email in database with proper labels
    if (result.data.id) {
      try {
        // Get user ID from database
      const user = await prisma.user.findUnique({
        where: { email: token.email as string }
      }) as any

        if (user) {
          // Store sent email in database with SENT label
        await prisma.email.create({
          data: {
            gmailId: result.data.id,
            userId: user.id,
            threadId: result.data.threadId || '',
            subject,
            from: token.email as string,
            to: [to],
              cc: [],
              bcc: [],
              content: htmlBody,
              snippet: htmlBody.replace(/<[^>]*>/g, '').substring(0, 200),
              labels: ['SENT'],
              isRead: true,
              isStarred: false,
              isImportant: false,
              isSpam: false,
              isTrash: false,
              isDraft: false,
              receivedAt: new Date()
            }
          })
        }
      } catch (dbError) {
        console.error('Error storing sent email in database:', dbError)
        // Don't fail the request if database storage fails
      }
    }

    return NextResponse.json({
      success: true,
      messageId: result.data.id
    })
  } catch (error) {
    console.error('Send email error:', error)
    
    // Handle authentication errors
    if (error && typeof error === 'object' && 'code' in error && error.code === 401) {
      return NextResponse.json({ 
        error: 'Authentication expired', 
        message: 'Please sign out and sign in again',
        requiresReauth: true 
      }, { status: 401 })
    }
    
    // Handle rate limiting errors
    if (error && typeof error === 'object' && 'code' in error && error.code === 429) {
      return NextResponse.json({ 
        error: 'Rate limit exceeded', 
        message: 'Too many requests. Please try again later.',
        retryAfter: 60 
      }, { status: 429 })
    }
    
    // Handle quota exceeded errors
    if (error && typeof error === 'object' && 'message' in error && 
        (error.message as string).toLowerCase().includes('quota')) {
      return NextResponse.json({ 
        error: 'Gmail API quota exceeded', 
        message: 'Daily email quota reached. Please try again tomorrow.',
      }, { status: 429 })
    }
    
    // Provide more specific error message
    const errorMessage = error && typeof error === 'object' && 'message' in error 
      ? error.message as string 
      : 'Failed to send email'
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}