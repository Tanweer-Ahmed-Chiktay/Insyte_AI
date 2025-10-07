import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic'
import { prisma } from '@/lib/prisma'
import gmailPushService from '@/lib/gmail-push-service'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get access token from session (JWT strategy)
    const accessToken = (session as any).accessToken
    const refreshToken = (session as any).refreshToken
    
    console.log('Session data:', { hasAccessToken: !!accessToken, hasRefreshToken: !!refreshToken, userEmail: session.user.email })
    
    if (!accessToken) {
      console.error('No access token found in session')
      return NextResponse.json({ error: 'No access token found. Please sign in with Google.' }, { status: 400 })
    }

    // Check if Gmail push service is properly configured
    if (!gmailPushService.isConfigured()) {
      const configStatus = gmailPushService.getConfigStatus()
      console.error('Gmail push service not configured:', configStatus)
      return NextResponse.json({
        error: 'Gmail watch requires Google Cloud Pub/Sub configuration.',
        configStatus
      }, { status: 400 })
    }

    console.log(`Setting up Gmail watch for ${session.user.email}`)

    // Set up Gmail watch using the push service
    try {
      const watchResponse = await gmailPushService.setupWatch(
        accessToken,
        refreshToken || '',
        session.user.email
      )
      
      const { historyId, expiration } = watchResponse

      // Update user with watch information
      await prisma.user.update({
        where: { email: session.user.email },
        data: {
          historyId,
          watchExpiration: new Date(parseInt(expiration))
        }
      })

      console.log(`[Gmail Watch] Updated user ${session.user.email} with historyId: ${historyId}, expiration: ${new Date(parseInt(expiration))}`)

      return NextResponse.json({
        success: true,
        historyId,
        expiration,
        expirationDate: new Date(parseInt(expiration)),
        message: 'Gmail watch setup successfully'
      })
      
    } catch (gmailError: any) {
      console.error('Gmail API watch error:', gmailError)
      
      // Check if it's a Pub/Sub topic error
      if (gmailError.message?.includes('topic') || gmailError.message?.includes('Pub/Sub')) {
        return NextResponse.json(
           { error: 'Gmail watch setup failed. Please ensure the Pub/Sub topic "MyTopic" exists in your Google Cloud project and has proper permissions.' },
          { status: 400 }
        )
      }
      
      // Generic Gmail API error
      return NextResponse.json(
        { error: `Gmail watch setup failed: ${gmailError.message || 'Unknown Gmail API error'}` },
        { status: 400 }
      )
    }

  } catch (error) {
    console.error('Gmail watch setup error:', error)
    return NextResponse.json(
      { error: 'Failed to setup Gmail watch' },
      { status: 500 }
    )
  }
}

// Get watch status
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        historyId: true,
        watchExpiration: true,
      }
    })

    const isActive = user?.watchExpiration && user.watchExpiration > new Date()

    return NextResponse.json({
      isActive,
      historyId: user?.historyId,
      expiration: user?.watchExpiration,
    })

  } catch (error) {
    console.error('Get watch status error:', error)
    return NextResponse.json(
      { error: 'Failed to get watch status' },
      { status: 500 }
    )
  }
}