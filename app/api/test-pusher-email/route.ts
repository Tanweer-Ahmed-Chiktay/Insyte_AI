import { NextRequest, NextResponse } from 'next/server'
import { triggerPusherEvent, PUSHER_EVENTS } from '@/lib/pusher-config'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// Test endpoint to manually trigger a Pusher email event
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Create email-based channel name to match frontend
    const channelName = `user-${session.user.email.replace('@', '-').replace('.', '-')}`
    
    // Create a test email payload
    const testEmailData = {
      id: `test-email-${Date.now()}`,
      subject: '🧪 Test Email from Pusher Pipeline',
      from: 'test@example.com',
      to: [session.user.email],
      snippet: 'This is a test email to verify Pusher real-time delivery is working correctly.',
      isRead: false,
      isStarred: false,
      isImportant: false,
      receivedAt: new Date().toISOString(),
      labels: ['INBOX', 'UNREAD'],
      category: 'inbox'
    }

    console.log(`[Test Pusher] Triggering test email event on channel: ${channelName}`)
    console.log(`[Test Pusher] Test email data:`, testEmailData)

    // Trigger the Pusher event
    await triggerPusherEvent(channelName, PUSHER_EVENTS.EMAIL_NEW, {
      email: testEmailData,
      timestamp: Date.now(),
      source: 'manual-test'
    })

    console.log(`[Test Pusher] ✅ Successfully triggered EMAIL_NEW event`)

    return NextResponse.json({
      success: true,
      message: 'Test email event triggered successfully',
      channelName,
      event: PUSHER_EVENTS.EMAIL_NEW,
      testEmailId: testEmailData.id,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('[Test Pusher] Error triggering test email event:', error)
    return NextResponse.json({
      error: 'Failed to trigger test email event',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// GET endpoint for testing
export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: 'Pusher Email Test Endpoint',
    usage: 'POST to this endpoint to trigger a test email event',
    timestamp: new Date().toISOString()
  })
}