import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getJobQueue } from '@/lib/job-queue'
// Use the same WebSocket manager instance as the custom server (CommonJS module)
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - importing CJS module in TS file
import wsModule from '@/lib/websocket/websocket-server.js'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const wsManager = (wsModule as any).wsManager

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { action, emailIds, fromCategory, toCategory } = body

    if (!action || !emailIds || !Array.isArray(emailIds)) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      )
    }

    // Validate action type
    const validActions = ['archive', 'delete', 'star', 'unstar', 'markRead', 'markUnread', 'move']
    if (!validActions.includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action type' },
        { status: 400 }
      )
    }

    // For move action, validate categories
    if (action === 'move' && (!fromCategory || !toCategory)) {
      return NextResponse.json(
        { error: 'Move action requires fromCategory and toCategory' },
        { status: 400 }
      )
    }

    const jobQueue = getJobQueue()
    // Use unified WebSocket manager
    
    // Queue the email action job
    const jobId = await jobQueue.addJob(
      'email-action',
      {
        userId: session.user.email,
        action,
        emailIds,
        fromCategory,
        toCategory
      },
      { priority: 1 } // High priority
    )

    // Send optimistic update to frontend immediately
    wsManager.broadcastToUser(session.user.email, {
      type: 'email:update',
      payload: {
        jobId,
        action,
        emailIds,
        fromCategory,
        toCategory,
        optimistic: true
      }
    })

    return NextResponse.json({
      success: true,
      jobId,
      message: `${action} action queued for ${emailIds.length} emails`
    })

  } catch (error) {
    console.error('[EmailActions] Error processing request:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}