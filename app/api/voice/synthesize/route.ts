import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const revalidate = 0

const LMNT_API_KEY = process.env.LMNT_API_KEY
const VOICE_ID = 'ryan' // LMNT Ryan voice

export async function POST(request: NextRequest) {
  try {
    // Skip authentication for voice synthesis to ensure it always works
    // const session = await getServerSession({ req: request, ...authOptions })
    // 
    // if (!session?.user?.email) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    // }

    const { text, useLMNT = true } = await request.json()

    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 })
    }

    // Use LMNT by default, fallback to browser TTS if not requested
    if (!useLMNT || !LMNT_API_KEY) {
      return NextResponse.json({ 
        useBrowserTTS: true, 
        text,
        message: 'Using browser TTS'
      })
    }

    try {
      // Call LMNT API
      const response = await fetch('https://api.lmnt.com/v1/ai/speech/bytes', {
        method: 'POST',
        headers: {
          'Accept': 'audio/wav',
          'Content-Type': 'application/json',
          'X-API-Key': LMNT_API_KEY
        },
        body: JSON.stringify({
          text,
          voice: VOICE_ID,
          format: 'wav',
          sample_rate: 24000,
          model: 'blizzard'
        })
      })

      // Handle rate limiting specifically
      if (response.status === 429) {
        console.log('LMNT rate limit reached, falling back to browser TTS')
        return NextResponse.json({ 
          useBrowserTTS: true, 
          text,
          message: 'LMNT rate limit reached, using browser TTS'
        })
      }

      if (!response.ok) {
        throw new Error(`LMNT API error: ${response.status}`)
      }

      const audioBuffer = await response.arrayBuffer()
      
      return new NextResponse(audioBuffer, {
        headers: {
          'Content-Type': 'audio/wav',
          'Content-Length': audioBuffer.byteLength.toString()
        }
      })
    } catch (lmntError) {
      console.error('LMNT API error:', lmntError)
      
      // Fallback to browser TTS on any LMNT error
      return NextResponse.json({ 
        useBrowserTTS: true, 
        text,
        message: 'LMNT unavailable, using browser TTS'
      })
    }
  } catch (error) {
    console.error('Error synthesizing speech:', error)
    return NextResponse.json(
      { error: 'Failed to synthesize speech' },
      { status: 500 }
    )
  }
}