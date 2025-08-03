import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { prisma } from '@/lib/prisma'
import { safeFindMany, safeUpdate, safeCreate, safeQuery } from '@/lib/prisma-wrapper'
import type { ScheduledEmail, User, Account } from '@prisma/client'

export async function POST(request: NextRequest) {
  try {
    // Get all pending scheduled emails that are due
    const dueEmails = await safeFindMany(prisma.scheduledEmail, {
      where: {
        status: 'pending',
        scheduledAt: {
          lte: new Date()
        }
      },
      include: {
        user: {
          include: {
            accounts: {
              where: {
                provider: 'google'
              }
            }
          }
        }
      },
      take: 10 // Process max 10 emails at a time
    }, 'scheduled-emails-lookup') as (ScheduledEmail & {
      user: User & {
        accounts: Account[]
      }
    })[]

    const results = []

    for (const scheduledEmail of dueEmails) {
      try {
        // Update status to processing
        await safeUpdate(prisma.scheduledEmail, {
          where: { id: scheduledEmail.id },
          data: { 
            status: 'processing',
            attempts: scheduledEmail.attempts + 1
          }
        }, 'scheduled-email-processing-update')

        const googleAccount = scheduledEmail.user.accounts.find(acc => acc.provider === 'google')
        
        if (!googleAccount?.access_token || !googleAccount?.refresh_token) {
          throw new Error('No valid Google account found')
        }

        // Initialize Gmail API
        const oauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET
        )

        oauth2Client.setCredentials({
          access_token: googleAccount.access_token,
          refresh_token: googleAccount.refresh_token
        })

        const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

        // Prepare email content
        const boundary = `boundary_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        
        let emailContent = [
          `From: ${scheduledEmail.user.email}`,
          `To: ${scheduledEmail.to}`,
          `Subject: ${scheduledEmail.subject}`,
          'MIME-Version: 1.0'
        ]

        // Handle attachments if they exist
        if (scheduledEmail.attachments && Array.isArray(scheduledEmail.attachments)) {
          emailContent.push(`Content-Type: multipart/mixed; boundary="${boundary}"`)
          emailContent.push('')
          emailContent.push(`--${boundary}`)
          emailContent.push('Content-Type: text/html; charset=utf-8')
          emailContent.push('Content-Transfer-Encoding: 7bit')
          emailContent.push('')
          emailContent.push(scheduledEmail.htmlBody)
          
          // Add attachments
          for (const attachment of scheduledEmail.attachments as any[]) {
            emailContent.push('')
            emailContent.push(`--${boundary}`)
            emailContent.push(`Content-Type: ${attachment.mimeType}; name="${attachment.filename}"`)
            emailContent.push('Content-Transfer-Encoding: base64')
            emailContent.push(`Content-Disposition: attachment; filename="${attachment.filename}"`)
            emailContent.push('')
            emailContent.push(attachment.content)
          }
          
          emailContent.push('')
          emailContent.push(`--${boundary}--`)
        } else {
          // Simple HTML email
          emailContent.push('Content-Type: text/html; charset=utf-8')
          emailContent.push('')
          emailContent.push(scheduledEmail.htmlBody)
        }
        
        const finalEmailContent = emailContent.join('\n')

        // Encode email
        const encodedEmail = Buffer.from(finalEmailContent)
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

        // Update status to sent
        await safeUpdate(prisma.scheduledEmail, {
          where: { id: scheduledEmail.id },
          data: { 
            status: 'sent',
            lastError: null
          }
        }, 'scheduled-email-sent-update')

        // Store sent email in database with proper labels
        if (result.data.id) {
          try {
            await safeCreate(prisma.email, {
              data: {
                gmailId: result.data.id,
                userId: scheduledEmail.userId,
                threadId: result.data.threadId || '',
                subject: scheduledEmail.subject,
                from: scheduledEmail.user.email!,
                to: [scheduledEmail.to],
                cc: [],
                bcc: [],
                content: scheduledEmail.htmlBody,
                snippet: scheduledEmail.htmlBody.replace(/<[^>]*>/g, '').substring(0, 200),
                labels: ['SENT'],
                isRead: true,
                isStarred: false,
                isImportant: false,
                isSpam: false,
                isTrash: false,
                isDraft: false,
                receivedAt: new Date()
              }
            }, 'scheduled-sent-email-create')
          } catch (dbError) {
            console.error('Error storing scheduled sent email in database:', dbError)
            // Don't fail the request if database storage fails
          }
        }

        results.push({
          id: scheduledEmail.id,
          status: 'sent',
          messageId: result.data.id
        })

      } catch (error) {
        console.error(`Failed to send scheduled email ${scheduledEmail.id}:`, error)
        
        // Update status to failed if max attempts reached, otherwise back to pending
        const maxAttempts = 3
        const newStatus = scheduledEmail.attempts >= maxAttempts ? 'failed' : 'pending'
        
        await safeUpdate(prisma.scheduledEmail, {
          where: { id: scheduledEmail.id },
          data: { 
            status: newStatus,
            lastError: error instanceof Error ? error.message : 'Unknown error'
          }
        }, 'scheduled-email-error-update')

        results.push({
          id: scheduledEmail.id,
          status: newStatus,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      results
    })

  } catch (error) {
    console.error('Process scheduled emails error:', error)
    return NextResponse.json(
      { error: 'Failed to process scheduled emails' },
      { status: 500 }
    )
  }
}

// GET endpoint to check scheduled emails status
export async function GET() {
  try {
    const stats = await safeQuery(
      () => prisma.scheduledEmail.groupBy({
        by: ['status'],
        _count: {
          id: true
        }
      }),
      'scheduled-emails-stats'
    )

    const upcomingEmails = await safeFindMany(prisma.scheduledEmail, {
      where: {
        status: 'pending',
        scheduledAt: {
          gte: new Date()
        }
      },
      orderBy: {
        scheduledAt: 'asc'
      },
      take: 5,
      select: {
        id: true,
        to: true,
        subject: true,
        scheduledAt: true
      }
    }, 'upcoming-emails-lookup')

    return NextResponse.json({
      stats,
      upcomingEmails
    })

  } catch (error) {
    console.error('Get scheduled emails stats error:', error)
    return NextResponse.json(
      { error: 'Failed to get scheduled emails stats' },
      { status: 500 }
    )
  }
}