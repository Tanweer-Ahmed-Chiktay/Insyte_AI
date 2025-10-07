import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { google } from 'googleapis'

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const startHistoryId = searchParams.get('startHistoryId')
    const historyTypes = searchParams.get('historyTypes') || 'messageAdded,messageDeleted'
    const maxResults = parseInt(searchParams.get('maxResults') || '100')
    
    if (!startHistoryId) {
      return NextResponse.json({ error: 'startHistoryId is required' }, { status: 400 })
    }

    // Get access token from session (JWT strategy)
    const accessToken = (session as any).accessToken
    const refreshToken = (session as any).refreshToken
    
    if (!accessToken) {
      return NextResponse.json({ error: 'No access token found' }, { status: 401 })
    }

    // Initialize Gmail API
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    )

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken
    })

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    // Get Gmail history
    const historyResponse = await gmail.users.history.list({
      userId: 'me',
      startHistoryId: startHistoryId,
      historyTypes: historyTypes.split(',') as any[],
      maxResults: maxResults
    })

    console.log(`[Gmail History API] Fetched history from ${startHistoryId}, found ${historyResponse.data.history?.length || 0} changes`)

    return NextResponse.json(historyResponse.data)
    
  } catch (error) {
    console.error('[Gmail History API] Error:', error)
    
    // Handle specific Gmail API errors
    if (error instanceof Error) {
      if (error.message.includes('Invalid historyId')) {
        return NextResponse.json(
          { error: 'Invalid historyId - may need full sync' },
          { status: 400 }
        )
      }
      if (error.message.includes('404')) {
        return NextResponse.json(
          { error: 'No history found for the given historyId' },
          { status: 404 }
        )
      }
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch Gmail history' },
      { status: 500 }
    )
  }
}