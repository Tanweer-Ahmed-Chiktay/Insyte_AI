import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ProviderFactory } from '@/lib/providers/provider-factory';
import { emailRateLimit } from '@/lib/utils/rate-limit';
import { CacheManager } from '@/lib/cache/cache-manager';
import { wsManager } from '@/lib/websocket/unified-websocket-manager';
import { z } from 'zod';

// Validation schemas
const emailListSchema = z.object({
  providerId: z.string().optional(),
  limit: z.number().min(1).max(100).default(20),
  pageToken: z.string().optional(),
  query: z.string().optional(),
  labelIds: z.array(z.string()).optional(),
  includeSpamTrash: z.boolean().default(false)
});

const sendEmailSchema = z.object({
  providerId: z.string(),
  to: z.array(z.string()),
  cc: z.array(z.string()).optional(),
  bcc: z.array(z.string()).optional(),
  subject: z.string(),
  body: z.string(),
  isHtml: z.boolean().default(true),
  attachments: z.array(z.object({
    filename: z.string(),
    content: z.string(),
    contentType: z.string()
  })).optional()
});

const emailActionSchema = z.object({
  emailIds: z.array(z.string()),
  action: z.enum(['markRead', 'markUnread', 'star', 'unstar', 'delete', 'archive']),
  providerId: z.string().optional()
});

// GET /api/emails/provider-agnostic - List emails from all or specific providers
export async function GET(request: NextRequest) {
  try {
    const providerFactory = new ProviderFactory(prisma);
    const cacheManager = new CacheManager();
    
    // Apply rate limiting
    const rateLimitResponse = await emailRateLimit(request);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const params = emailListSchema.parse({
      providerId: searchParams.get('providerId') || undefined,
      limit: parseInt(searchParams.get('limit') || '20'),
      pageToken: searchParams.get('pageToken') || undefined,
      query: searchParams.get('query') || undefined,
      labelIds: searchParams.get('labelIds')?.split(',') || undefined,
      includeSpamTrash: searchParams.get('includeSpamTrash') === 'true'
    });

    const userId = session.user.id;
    const cacheKey = `emails:${userId}:${JSON.stringify(params)}`;

    // Try to get from cache first
    const cachedResult = await cacheManager.get(cacheKey);
    if (cachedResult) {
      return NextResponse.json(cachedResult);
    }

    let allEmails: any[] = [];
    let nextPageToken: string | undefined;
    let totalCount = 0;

    if (params.providerId) {
      // Get emails from specific provider
      const provider = await providerFactory.getEmailProvider(params.providerId);
      if (!provider) {
        return NextResponse.json(
          { error: 'Provider not found or not accessible' },
          { status: 404 }
        );
      }

      const result = await provider.getEmails({
        maxResults: params.limit,
        pageToken: params.pageToken,
        query: params.query,
        labelIds: params.labelIds
      });

      allEmails = result.emails;
      nextPageToken = result.nextPageToken;
      totalCount = result.totalCount || 0;
    } else {
      // Get emails from all user's providers
      const providers = await providerFactory.getUserEmailProviders(userId);
      
      if (providers.length === 0) {
        return NextResponse.json({
          emails: [],
          nextPageToken: undefined,
          totalCount: 0,
          providers: []
        });
      }

      // Fetch from all providers in parallel
      const providerResults = await Promise.allSettled(
        providers.map(async (provider) => {
          try {
            return await provider.getEmails({
              maxResults: Math.ceil(params.limit / providers.length),
              pageToken: params.pageToken,
              query: params.query,
              labelIds: params.labelIds
            });
          } catch (error) {
            console.error('Error fetching from provider:', error);
            return { emails: [], totalCount: 0 };
          }
        })
      );

      // Combine results
      providerResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          allEmails.push(...result.value.emails);
          totalCount += result.value.totalCount || 0;
        }
      });

      // Sort by date (newest first) and limit
      allEmails.sort((a, b) => 
        new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
      );
      allEmails = allEmails.slice(0, params.limit);
    }

    const result = {
      emails: allEmails,
      nextPageToken,
      totalCount,
      providers: params.providerId ? [params.providerId] : 
        (await providerFactory.getUserEmailProviders(userId)).length
    };

    // Cache the result for 2 minutes
    await cacheManager.set(cacheKey, result, 120);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching emails:', error);
    return NextResponse.json(
      { error: 'Failed to fetch emails' },
      { status: 500 }
    );
  }
}

// POST /api/emails/provider-agnostic - Send email
export async function POST(request: NextRequest) {
  try {
    const providerFactory = new ProviderFactory(prisma);
    const cacheManager = new CacheManager();
    
    // Apply rate limiting
    const rateLimitResponse = await emailRateLimit(request);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const params = sendEmailSchema.parse(body);

    const provider = await providerFactory.getEmailProvider(params.providerId);
    if (!provider) {
      return NextResponse.json(
        { error: 'Provider not found or not accessible' },
        { status: 404 }
      );
    }

    const result = await provider.sendEmail({
      to: params.to,
      cc: params.cc,
      bcc: params.bcc,
      subject: params.subject,
      htmlBody: params.body,
      textBody: params.isHtml ? undefined : params.body,
      attachments: params.attachments
    });

    // Invalidate email cache for this user
    await cacheManager.invalidate(`emails:${session.user.id}:*`);

    // Notify via WebSocket
    wsManager.notifyEmailUpdate(session.user.id, {
      category: 'sent',
      action: 'added',
      emailIds: [result.id]
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error sending email:', error);
    return NextResponse.json(
      { error: 'Failed to send email' },
      { status: 500 }
    );
  }
}

// PATCH /api/emails/provider-agnostic - Bulk email actions
export async function PATCH(request: NextRequest) {
  try {
    const providerFactory = new ProviderFactory(prisma);
    const cacheManager = new CacheManager();
    
    // Apply rate limiting
    const rateLimitResponse = await emailRateLimit(request);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

  const body = await request.json();
  const params = emailActionSchema.parse(body);
  const correlationId = `arch-${Math.random().toString(36).slice(2)}`;

    const userId = session.user.id;
    let results: any[] = [];

    if (params.providerId) {
      // Apply action to specific provider
      const provider = await providerFactory.getEmailProvider(params.providerId);
      if (!provider) {
        return NextResponse.json(
          { error: 'Provider not found or not accessible' },
          { status: 404 }
        );
      }

      results = await Promise.allSettled(
        params.emailIds.map(async (emailId) => {
          switch (params.action) {
            case 'markRead':
              return await provider.markAsRead(emailId);
            case 'markUnread':
              return await provider.markAsUnread(emailId);
            case 'star':
              return await provider.starEmail(emailId);
            case 'unstar':
              return await provider.unstarEmail(emailId);
            case 'delete':
              return await provider.deleteEmail(emailId);
            case 'archive':
              try {
                const before = await provider.getEmail(emailId).catch(() => null);
                console.log('[Archive][Before]', { correlationId, provider: provider.constructor.name, emailId, labels: before?.labels });
                const archiveResult = await provider.archiveEmail(emailId);
                const after = await provider.getEmail(emailId).catch(() => null);
                console.log('[Archive][After]', { correlationId, provider: provider.constructor.name, emailId, labels: after?.labels });
                return archiveResult;
              } catch (e) {
                console.error('[Archive][Error]', { correlationId, provider: provider.constructor.name, emailId, error: (e as any)?.message || e });
                throw e;
              }
            default:
              throw new Error(`Unknown action: ${params.action}`);
          }
        })
      );
    } else {
      // Apply action across all providers
      const providers = await providerFactory.getUserEmailProviders(userId);
      
      for (const provider of providers) {
        console.log(`Processing ${params.action} action for provider: ${provider.constructor.name}`);
        const providerResults = await Promise.allSettled(
          params.emailIds.map(async (emailId) => {
            try {
              console.log(`Attempting ${params.action} on email ${emailId} via ${provider.constructor.name}`);
              switch (params.action) {
                case 'markRead':
                  return await provider.markAsRead(emailId);
                case 'markUnread':
                  return await provider.markAsUnread(emailId);
                case 'star':
                  return await provider.starEmail(emailId);
                case 'unstar':
                  return await provider.unstarEmail(emailId);
                case 'delete':
                  const deleteResult = await provider.deleteEmail(emailId);
                  console.log(`Delete result for ${emailId}:`, deleteResult);
                  return deleteResult;
                case 'archive':
                  try {
                    const before = await provider.getEmail(emailId).catch(() => null);
                    console.log('[Archive][Before]', { correlationId, provider: provider.constructor.name, emailId, labels: before?.labels });
                    const archiveResult = await provider.archiveEmail(emailId);
                    const after = await provider.getEmail(emailId).catch(() => null);
                    console.log('[Archive][After]', { correlationId, provider: provider.constructor.name, emailId, labels: after?.labels });
                    return archiveResult;
                  } catch (e) {
                    console.error('[Archive][Error]', { correlationId, provider: provider.constructor.name, emailId, error: (e as any)?.message || e });
                    throw e;
                  }
                default:
                  throw new Error(`Unknown action: ${params.action}`);
              }
            } catch (error) {
              console.error(`Error performing ${params.action} on email ${emailId} via ${provider.constructor.name}:`, error);
              // Email might not exist in this provider, continue
              return null;
            }
          })
        );
        results.push(...providerResults);
      }
    }

    // Persist action to local DB so UI reflects changes on refresh
    try {
      if (['archive', 'delete'].includes(params.action)) {
        const emailsToUpdate = await prisma.email.findMany({
          where: {
            userId,
            externalId: { in: params.emailIds }
          },
          select: { id: true, labels: true }
        });

        for (const email of emailsToUpdate) {
          const currentLabels = Array.isArray(email.labels) ? email.labels : [];
          let updatedLabels = currentLabels;
          let setTrash = false;
          let setRead = true;

          if (params.action === 'archive') {
            // Gmail archive semantics: remove INBOX
            updatedLabels = currentLabels.filter(l => l !== 'INBOX');
          } else if (params.action === 'delete') {
            // Move to trash: remove INBOX and add TRASH
            updatedLabels = currentLabels.filter(l => l !== 'INBOX');
            if (!updatedLabels.includes('TRASH')) updatedLabels.push('TRASH');
            setTrash = true;
          }

          await prisma.email.update({
            where: { id: email.id },
            data: {
              labels: updatedLabels,
              isTrash: setTrash,
              isRead: setRead
            }
          });
        }
      }
    } catch (dbErr) {
      console.error('Failed to update email records after action:', dbErr);
    }

    // Invalidate email cache for this user
    await cacheManager.invalidate(`emails:${userId}:*`);

    // Notify via WebSocket
    wsManager.notifyEmailUpdate(userId, {
      category: 'inbox',
      action: params.action === 'markRead' ? 'read' : 
              params.action === 'markUnread' ? 'unread' :
              params.action === 'star' ? 'starred' :
              params.action === 'unstar' ? 'unstarred' :
              params.action === 'delete' ? 'deleted' :
              params.action === 'archive' ? 'moved' : 'updated',
      emailIds: params.emailIds
    });

    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const errorCount = results.filter(r => r.status === 'rejected').length;

    return NextResponse.json({
      success: true,
      processed: params.emailIds.length,
      successful: successCount,
      failed: errorCount,
      action: params.action
    });
  } catch (error) {
    console.error('Error performing email action:', error);
    return NextResponse.json(
      { error: 'Failed to perform email action' },
      { status: 500 }
    );
  }
}