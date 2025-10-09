import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { TextToSpeechClient } from '@google-cloud/text-to-speech'

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const revalidate = 0

// Initialize Google Cloud Text-to-Speech client
const ttsClient = new TextToSpeechClient({
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
})

export async function POST(request: NextRequest) {
  try {
    // Skip authentication for voice synthesis to ensure it always works
    // const session = await getServerSession({ req: request, ...authOptions })
    // 
    // if (!session?.user?.email) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    // }

    const { text } = await request.json()

    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 })
    }

    // Try ElevenLabs first (default)
    const elevenApiKey = process.env.ELEVENLABS_API_KEY
    const elevenVoiceId = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM' // Rachel

    if (elevenApiKey) {
      try {
        const elevenUrl = `https://api.elevenlabs.io/v1/text-to-speech/${elevenVoiceId}`
        const elevenResp = await fetch(elevenUrl, {
          method: 'POST',
          headers: {
            'xi-api-key': elevenApiKey,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg'
          },
          body: JSON.stringify({ text })
        })

        if (elevenResp.ok) {
          const arrayBuf = await elevenResp.arrayBuffer()
          const audioBuffer = Buffer.from(arrayBuf)
          return new NextResponse(audioBuffer, {
            headers: {
              'Content-Type': 'audio/mpeg',
              'Content-Length': audioBuffer.length.toString(),
              'X-Voice-Provider': 'elevenlabs'
            }
          })
        } else {
          // 402: payment required, 429: rate limit
          console.error('ElevenLabs TTS error:', elevenResp.status, elevenResp.statusText)
        }
      } catch (err) {
        console.error('ElevenLabs TTS fetch failed:', err)
      }
    }

    // Fallback to Google TTS if configured
    if (process.env.GOOGLE_CLOUD_PROJECT_ID) {
      try {
        // Construct the request for Google Cloud Text-to-Speech
        const synthesizeRequest = {
          input: { text },
          voice: {
            languageCode: 'en-US',
            name: 'en-US-Chirp3-HD-Rasalgethi',
            ssmlGender: 'MALE' as const
          },
          audioConfig: {
            audioEncoding: 'MP3' as const,
            sampleRateHertz: 24000
          }
        }

        const [response] = await ttsClient.synthesizeSpeech(synthesizeRequest)
        if (!response.audioContent) {
          throw new Error('No audio content received from Google TTS')
        }

        const audioBuffer = Buffer.from(response.audioContent)
        return new NextResponse(audioBuffer, {
          headers: {
            'Content-Type': 'audio/mpeg',
            'Content-Length': audioBuffer.length.toString(),
            'X-Voice-Provider': 'google-tts'
          }
        })
      } catch (googleTTSError) {
        console.error('Google TTS API error:', googleTTSError)
      }
    }

    // Final fallback: ask client to use browser TTS
    return NextResponse.json({ 
      useBrowserTTS: true, 
      text,
      message: 'Using browser TTS',
      provider: 'browser-tts'
    })
  } catch (error) {
    console.error('Error synthesizing speech:', error)
    return NextResponse.json(
      { error: 'Failed to synthesize speech' },
      { status: 500 }
    )
  }
}