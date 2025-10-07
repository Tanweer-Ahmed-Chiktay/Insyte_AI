import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { wsManager } from '@/lib/websocket/unified-websocket-manager'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { messageIds = [`test-msg-${Date.now()}`], count = 1 } = body

    console.log('[Test Gmail Push] Simulating Gmail push notification for user:', session.user.id)
    console.log('[Test Gmail Push] Message IDs:', messageIds)

    // Simulate Gmail push notification via WebSocket
    wsManager.broadcastToUser(session.user.id, {
      type: 'gmail-push-notification',
      payload: {
        emailAddress: session.user.email,
        historyId: `test-history-${Date.now()}`,
        changes: {
          newMessageIds: messageIds
        },
        newEmailCount: count,
        timestamp: Date.now()
      },
      timestamp: Date.now()
    })

    // Also test direct email:update notification
    wsManager.notifyEmailUpdate(session.user.id, {
      category: 'inbox',
      action: 'added',
      emailIds: messageIds,
      count: count
    })

    return NextResponse.json({ 
      success: true, 
      messageIds,
      count,
      userId: session.user.id
    })
  } catch (error) {
    console.error('[Test Gmail Push] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}