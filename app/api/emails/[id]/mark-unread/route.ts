import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { google } from 'googleapis'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!session.accessToken) {
      return NextResponse.json({ error: 'No access token available' }, { status: 401 })
    }

    // Set up OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    )

    oauth2Client.setCredentials({
      access_token: session.accessToken,
      refresh_token: session.refreshToken
    })

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    // Mark email as unread by adding UNREAD label
    await gmail.users.messages.modify({
      userId: 'me',
      id: params.id,
      requestBody: {
        addLabelIds: ['UNREAD']
      }
    })

    return NextResponse.json({ 
      success: true,
      message: 'Email marked as unread'
    })

  } catch (error) {
    console.error('Error marking email as unread:', error)
    
    // Check for authentication errors
    const is401Error = (
      (error as any)?.response?.status === 401 ||
      (error as any)?.status === 401 ||
      (error instanceof Error && error.message.includes('401'))
    )
    
    if (is401Error) {
      return NextResponse.json({ 
        error: 'Authentication expired. Please sign in again.' 
      }, { status: 401 })
    }
    
    return NextResponse.json(
      { error: 'Failed to mark email as unread' },
      { status: 500 }
    )
  }
}