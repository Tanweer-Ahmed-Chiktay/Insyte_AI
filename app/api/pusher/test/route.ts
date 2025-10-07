import { NextResponse } from 'next/server'
import { pusherServer } from '@/lib/pusher-config'

export async function GET() {
  try {
    // Test Pusher configuration
    const config = {
      appId: process.env.PUSHER_APP_ID,
      key: process.env.PUSHER_KEY,
      secret: process.env.PUSHER_SECRET ? '[REDACTED]' : undefined,
      cluster: process.env.PUSHER_CLUSTER,
      clientKey: process.env.NEXT_PUBLIC_PUSHER_KEY,
      clientCluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
    }

    // Test a simple trigger to verify connection
    try {
      await pusherServer.trigger('test-channel', 'test-event', {
        message: 'Pusher configuration test',
        timestamp: new Date().toISOString()
      })
      
      return NextResponse.json({
        success: true,
        message: 'Pusher configuration is working',
        config,
        triggerTest: 'SUCCESS'
      })
    } catch (triggerError: any) {
      return NextResponse.json({
        success: false,
        message: 'Pusher trigger failed',
        config,
        triggerTest: 'FAILED',
        triggerError: triggerError.message
      })
    }
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      message: 'Pusher configuration error',
      error: error.message
    }, { status: 500 })
  }
}