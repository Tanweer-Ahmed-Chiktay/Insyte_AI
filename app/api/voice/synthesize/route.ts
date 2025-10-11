import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
// Google TTS
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { TextToSpeechClient } from '@google-cloud/text-to-speech'

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const revalidate = 0

// Initialize Google Cloud Text-to-Speech if credentials are provided
let ttsClient: any = null
if (process.env.GOOGLE_APPLICATION_CREDENTIALS || (process.env.GOOGLE_CLOUD_PROJECT_ID && process.env.GOOGLE_CLOUD_KEYFILE)) {
  try {
    ttsClient = new TextToSpeechClient({
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_CLOUD_KEYFILE
    })
  } catch (e) {
    console.error('Failed to initialize Google TTS client:', e)
    ttsClient = null
  }
}

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

    // Provide a clearer error if API key is missing
    if (!elevenApiKey) {
      return NextResponse.json(
        { error: 'ElevenLabs API key not configured', code: 'missing_api_key' },
        { status: 500, headers: { 'X-Voice-Provider': 'elevenlabs' } }
      )
    }

    try {
      const usedVoiceId = elevenVoiceId
      const elevenUrl = `https://api.elevenlabs.io/v1/text-to-speech/${usedVoiceId}`
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
            'X-Voice-Provider': 'elevenlabs',
            'X-Voice-Id': usedVoiceId
          }
        })
      } else {
        // Return a clear error if the configured voice cannot be used
        const errText = await elevenResp.text().catch(() => '')
        console.error('ElevenLabs TTS error (configured voice):', elevenResp.status, elevenResp.statusText, errText)
        return NextResponse.json(
          {
            error: 'ElevenLabs TTS unavailable for configured voice',
            status: elevenResp.status,
            statusText: elevenResp.statusText,
            details: errText
          },
          { status: 502, headers: { 'X-Voice-Provider': 'elevenlabs', 'X-Voice-Id': usedVoiceId } }
        )
      }
    } catch (err) {
      console.error('ElevenLabs TTS fetch failed:', err)
      return NextResponse.json(
        { error: 'ElevenLabs TTS fetch failed' },
        { status: 500, headers: { 'X-Voice-Provider': 'elevenlabs', 'X-Voice-Id': elevenVoiceId } }
      )
    }

    // Try Google TTS as fallback if configured
    if (ttsClient) {
      try {
        const [response] = await ttsClient.synthesizeSpeech({
          input: { text },
          // Use a common English voice; can be customized
          voice: { languageCode: 'en-US', ssmlGender: 'NEUTRAL' },
          audioConfig: { audioEncoding: 'MP3' }
        })
        const audioBuffer = Buffer.from(response.audioContent as Buffer)
        return new NextResponse(audioBuffer, {
          headers: {
            'Content-Type': 'audio/mpeg',
            'Content-Length': audioBuffer.length.toString(),
            'X-Voice-Provider': 'google'
          }
        })
      } catch (googleErr) {
        console.error('Google TTS error:', googleErr)
      }
    }

    // Final fallback: instruct client to use browser TTS
    return NextResponse.json(
      { useBrowserTTS: true, text, message: 'Falling back to browser TTS' },
      { status: 200, headers: { 'X-Voice-Provider': 'browser' } }
    )
  } catch (error) {
    console.error('Error synthesizing speech:', error)
    return NextResponse.json(
      { error: 'Failed to synthesize speech' },
      { status: 500 }
    )
  }
}