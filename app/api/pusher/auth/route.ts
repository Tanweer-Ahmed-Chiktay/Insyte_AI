import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { pusherServer } from '@/lib/pusher-config'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.text()
    const params = new URLSearchParams(body)
    const socketId = params.get('socket_id')
    const channelName = params.get('channel_name')

    if (!socketId || !channelName) {
      return NextResponse.json(
        { error: 'Missing socket_id or channel_name' },
        { status: 400 }
      )
    }

    // Verify user can access this channel
    const userChannelPattern = `user-${session.user.email.replace('@', '-').replace('.', '-')}`
    
    if (!channelName.startsWith('presence-') && !channelName.startsWith('private-') && channelName !== userChannelPattern) {
      return NextResponse.json(
        { error: 'Forbidden channel access' },
        { status: 403 }
      )
    }

    // For presence channels, include user data
    if (channelName.startsWith('presence-')) {
      const presenceData = {
        user_id: session.user.email,
        user_info: {
          name: session.user.name || session.user.email,
          email: session.user.email,
        },
      }

      const authResponse = pusherServer.authorizeChannel(socketId, channelName, presenceData)
      return NextResponse.json(authResponse)
    }

    // For private channels
    const authResponse = pusherServer.authorizeChannel(socketId, channelName)
    return NextResponse.json(authResponse)
    
  } catch (error) {
    console.error('Pusher auth error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}