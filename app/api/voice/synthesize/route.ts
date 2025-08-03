import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic'

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY
const VOICE_ID = 's3TPKV1kjDlVtZbl4Ksh' // Updated voice

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { text, fallbackToBrowser } = await request.json()

    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 })
    }

    // If explicitly requested to use browser TTS or ElevenLabs not configured
    if (fallbackToBrowser || !ELEVENLABS_API_KEY) {
      return NextResponse.json({ 
        useBrowserTTS: true, 
        text,
        message: fallbackToBrowser ? 'Using browser TTS due to rate limit' : 'ElevenLabs not configured, using browser TTS'
      })
    }

    try {
      // Call ElevenLabs API
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.5
          }
        })
      })

      // Handle rate limiting specifically
      if (response.status === 429) {
        console.log('ElevenLabs rate limit reached, falling back to browser TTS')
        return NextResponse.json({ 
          useBrowserTTS: true, 
          text,
          message: 'Rate limit reached, using browser TTS'
        })
      }

      if (!response.ok) {
        throw new Error(`ElevenLabs API error: ${response.status}`)
      }

      const audioBuffer = await response.arrayBuffer()
      
      return new NextResponse(audioBuffer, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Length': audioBuffer.byteLength.toString()
        }
      })
    } catch (elevenLabsError) {
      console.error('ElevenLabs API error:', elevenLabsError)
      
      // Fallback to browser TTS on any ElevenLabs error
      return NextResponse.json({ 
        useBrowserTTS: true, 
        text,
        message: 'ElevenLabs unavailable, using browser TTS'
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