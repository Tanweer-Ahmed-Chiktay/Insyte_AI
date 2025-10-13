import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ProviderFactory } from '@/lib/providers/provider-factory'
import { z } from 'zod'

const bodySchema = z.object({
  emailId: z.string(),
  providerId: z.string().optional()
})

export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  const correlationId = `diag-${Math.random().toString(36).slice(2)}`
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { emailId, providerId } = bodySchema.parse(await request.json())
    const userId = session.user.id

    const providerFactory = new ProviderFactory(prisma)
    let provider = null as any
    if (providerId) {
      provider = await providerFactory.getEmailProvider(providerId)
    } else {
      const providers = await providerFactory.getUserEmailProviders(userId)
      provider = providers.find(p => p.constructor.name.includes('Gmail')) || providers[0]
    }

    if (!provider) {
      return NextResponse.json({ error: 'No email provider available' }, { status: 404 })
    }

    // DB state BEFORE
    const dbBefore = await prisma.email.findFirst({
      where: { userId, externalId: emailId },
      select: { id: true, labels: true, isTrash: true, isRead: true }
    })

    // Gmail state BEFORE
    const gmailBefore = await provider.getEmail(emailId).catch(() => null)
    console.log('[Diag][Before]', { correlationId, emailId, provider: provider.constructor.name, db: dbBefore, gmailLabels: gmailBefore?.labels })

    // Archive via provider
    const archiveStart = Date.now()
    const archiveResult = await provider.archiveEmail(emailId)
    const archiveDuration = Date.now() - archiveStart

    // Gmail state AFTER
    const gmailAfter = await provider.getEmail(emailId).catch(() => null)

    // DB state AFTER
    const dbAfter = await prisma.email.findFirst({
      where: { userId, externalId: emailId },
      select: { id: true, labels: true, isTrash: true, isRead: true }
    })

    console.log('[Diag][After]', { correlationId, emailId, provider: provider.constructor.name, gmailLabels: gmailAfter?.labels, archiveDuration })

    const inboxRemoved = Array.isArray(gmailAfter?.labels) && !gmailAfter.labels.includes('INBOX')
    const response = {
      correlationId,
      emailId,
      provider: provider.constructor.name,
      durations: {
        totalMs: Date.now() - startedAt,
        archiveMs: archiveDuration
      },
      gmail: {
        beforeLabels: gmailBefore?.labels || null,
        afterLabels: gmailAfter?.labels || null,
        inboxRemoved
      },
      db: {
        before: dbBefore || null,
        after: dbAfter || null
      },
      result: archiveResult
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[Diag] Archive diagnostic error:', error)
    return NextResponse.json({ error: 'Failed to run archive diagnostic' }, { status: 500 })
  }
}