import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { google } from 'googleapis'

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

    // Get Gmail profile
    const profile = await gmail.users.getProfile({
      userId: 'me'
    })

    return NextResponse.json(profile.data)
    
  } catch (error) {
    console.error('[Gmail Profile API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch Gmail profile' },
      { status: 500 }
    )
  }
}