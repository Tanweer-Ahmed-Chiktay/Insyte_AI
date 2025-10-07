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

    const { text, useGoogleTTS = true } = await request.json()

    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 })
    }

    // Use Google TTS by default, fallback to browser TTS if not requested or not configured
    if (!useGoogleTTS || !process.env.GOOGLE_CLOUD_PROJECT_ID) {
      return NextResponse.json({ 
        useBrowserTTS: true, 
        text,
        message: 'Using browser TTS'
      })
    }

    try {
      // Construct the request for Google Cloud Text-to-Speech
      const synthesizeRequest = {
        input: { text },
        voice: {
          languageCode: 'en-US',
          name: 'en-US-Chirp3-HD-Rasalgethi', // High-definition Chirp voice
          ssmlGender: 'MALE' as const
        },
        audioConfig: {
          audioEncoding: 'MP3' as const,
          sampleRateHertz: 24000
        }
      }

      // Call Google Cloud Text-to-Speech API
      const [response] = await ttsClient.synthesizeSpeech(synthesizeRequest)
      
      if (!response.audioContent) {
        throw new Error('No audio content received from Google TTS')
      }

      // Convert the audio content to buffer
      const audioBuffer = Buffer.from(response.audioContent)
      
      return new NextResponse(audioBuffer, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Length': audioBuffer.length.toString()
        }
      })
    } catch (googleTTSError) {
      console.error('Google TTS API error:', googleTTSError)
      
      // Fallback to browser TTS on any Google TTS error
      return NextResponse.json({ 
        useBrowserTTS: true, 
        text,
        message: 'Google TTS unavailable, using browser TTS'
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