import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { prisma } from '@/lib/prisma'
// Removed prisma-wrapper - using prisma directly
import type { ScheduledEmail, User, Account } from '@prisma/client'
import { autoConvertMarkdown } from '@/lib/markdown-to-html'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const revalidate = 0

export async function POST(request: NextRequest) {
  try {
    // Get all pending scheduled emails that are due
    const dueEmails = await prisma.scheduledEmail.findMany({
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
      take: 5 // Reduced from 10 to 5 to avoid rate limits
    }) as (ScheduledEmail & {
      user: User & {
        accounts: Account[]
      }
    })[]

    const results = []

    for (const scheduledEmail of dueEmails) {
      try {
        // Update status to processing
        await prisma.scheduledEmail.update({
          where: { id: scheduledEmail.id },
          data: { 
            status: 'processing',
            attempts: scheduledEmail.attempts + 1
          }
        })

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

        // Auto-convert Markdown to HTML with syntax highlighting if needed
        const processedHtmlBody = await autoConvertMarkdown(scheduledEmail.htmlBody)
        
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
          emailContent.push(processedHtmlBody)
          
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
          emailContent.push(processedHtmlBody)
        }
        
        const finalEmailContent = emailContent.join('\n')

        // Encode email
        const encodedEmail = Buffer.from(finalEmailContent)
          .toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '')

        // Send email with retry logic for rate limits
        let result: any = null
        let retryCount = 0
        const maxRetries = 3
        
        while (retryCount < maxRetries) {
          try {
            result = await gmail.users.messages.send({
              userId: 'me',
              requestBody: {
                raw: encodedEmail
              }
            })
            break // Success, exit retry loop
          } catch (sendError: any) {
            if (sendError.code === 429 || sendError.message?.includes('Too Many Requests')) {
              retryCount++
              if (retryCount < maxRetries) {
                // Exponential backoff: wait 2^retryCount seconds
                const waitTime = Math.pow(2, retryCount) * 1000
                console.log(`Rate limited, waiting ${waitTime}ms before retry ${retryCount}/${maxRetries}`)
                await new Promise(resolve => setTimeout(resolve, waitTime))
                continue
              }
            }
            throw sendError // Re-throw if not rate limit or max retries reached
          }
        }

        if (!result) {
          throw new Error('Failed to send email after all retries')
        }

        // Update status to sent
        await prisma.scheduledEmail.update({
          where: { id: scheduledEmail.id },
          data: { 
            status: 'sent',
            lastError: null
          }
        })

        // Store sent email in database with proper labels
        if (result.data?.id) {
          try {
            // Ensure Gmail email provider exists for this user
            const emailProvider = await prisma.emailProvider.upsert({
              where: {
                userId_provider_email: {
                  userId: scheduledEmail.userId,
                  provider: 'gmail',
                  email: scheduledEmail.user.email!
                }
              },
              update: {
                isActive: true
              },
              create: {
                userId: scheduledEmail.userId,
                provider: 'gmail',
                email: scheduledEmail.user.email!,
                isActive: true
              }
            })

            await prisma.email.create({
              data: {
                externalId: result.data.id,
                user: { connect: { id: scheduledEmail.userId } },
                provider: { connect: { id: emailProvider.id } },
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
            })
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

      } catch (error: any) {
        console.error(`Failed to send scheduled email ${scheduledEmail.id}:`, error)
        
        // Handle rate limiting specifically
        if (error.code === 429 || error.message?.includes('Too Many Requests')) {
          // For rate limit errors, keep as pending and try again later
          await prisma.scheduledEmail.update({
            where: { id: scheduledEmail.id },
            data: { 
              status: 'pending',
              lastError: 'Rate limited - will retry later',
              // Don't increment attempts for rate limit errors
            }
          })
          
          results.push({
            id: scheduledEmail.id,
            status: 'rate_limited',
            error: 'Rate limited - will retry later'
          })
        } else {
          // Update status to failed if max attempts reached, otherwise back to pending
          const maxAttempts = 3
          const newStatus = scheduledEmail.attempts >= maxAttempts ? 'failed' : 'pending'
          
          await prisma.scheduledEmail.update({
            where: { id: scheduledEmail.id },
            data: { 
              status: newStatus,
              lastError: error instanceof Error ? error.message : 'Unknown error'
            }
          })

          results.push({
            id: scheduledEmail.id,
            status: newStatus,
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        }
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
    const stats = await prisma.scheduledEmail.groupBy({
      by: ['status'],
      _count: {
        id: true
      }
    })

    const upcomingEmails = await prisma.scheduledEmail.findMany({
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
    })

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