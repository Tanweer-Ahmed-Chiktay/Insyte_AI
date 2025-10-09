import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { google } from 'googleapis'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; attachmentId: string } }
) {
  let session = null
  try {
    session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!session.accessToken) {
      return NextResponse.json({ error: 'No access token available' }, { status: 401 })
    }

    const url = new URL(request.url)
    const mode = url.searchParams.get('mode') || 'attachment' // 'inline' or 'attachment'
    const filename = url.searchParams.get('filename') || 'attachment'
    const mimeType = url.searchParams.get('mimeType') || 'application/octet-stream'

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.NEXTAUTH_URL
    )

    oauth2Client.setCredentials({
      access_token: session.accessToken,
      refresh_token: session.refreshToken
    })

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    // Fetch the attachment data from Gmail
    const attachmentRes = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId: params.id,
      id: params.attachmentId
    })

    const data = attachmentRes.data.data
    if (!data) {
      return NextResponse.json({ error: 'Attachment data not found' }, { status: 404 })
    }

    // Gmail returns base64url encoded data; convert to Buffer
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/')
    const buffer = Buffer.from(base64, 'base64')

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Length': buffer.length.toString(),
        'Content-Disposition': `${mode}; filename="${filename}"`
      }
    })
  } catch (error) {
    console.error('Attachment fetch error:', error)
    const is401Error = (
      (error as any)?.response?.status === 401 ||
      (error as any)?.status === 401 ||
      (error instanceof Error && error.message.includes('401'))
    )
    if (is401Error) {
      return NextResponse.json({ error: 'Authentication expired. Please sign in again.' }, { status: 401 })
    }
    const status = (error as any)?.response?.status || (error as any)?.status || (error as any)?.code
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Failed to fetch attachment', message, status }, { status: 500 })
  }
}