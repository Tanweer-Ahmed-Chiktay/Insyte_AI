import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic'
import Groq from 'groq-sdk'

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
})

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({ error: 'Groq API key not configured' }, { status: 500 })
    }

    const formData = await request.formData()
    const audioFile = formData.get('audio') as File

    if (!audioFile) {
      return NextResponse.json({ error: 'Audio file is required' }, { status: 400 })
    }

    // Validate file type - support webm with codecs
    const allowedTypes = ['audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/webm', 'audio/ogg']
    const isWebmWithCodecs = audioFile.type.startsWith('audio/webm')
    
    if (!allowedTypes.includes(audioFile.type) && !isWebmWithCodecs) {
      return NextResponse.json({ 
        error: 'Invalid audio format. Supported formats: WAV, MP3, WebM, OGG' 
      }, { status: 400 })
    }

    // Validate file size (max 25MB for Whisper)
    const maxSize = 25 * 1024 * 1024 // 25MB
    if (audioFile.size > maxSize) {
      return NextResponse.json({ 
        error: 'Audio file too large. Maximum size is 25MB' 
      }, { status: 400 })
    }

    try {
      // Convert File to Buffer for Groq API
      const audioBuffer = await audioFile.arrayBuffer()
      const audioBlob = new Blob([audioBuffer], { type: audioFile.type })
      
      // Create a File object for Groq API
      const file = new File([audioBlob], audioFile.name || 'audio.wav', {
        type: audioFile.type
      })

      // Call Groq Whisper API
      const transcription = await groq.audio.transcriptions.create({
        file: file,
        model: 'whisper-large-v3',
        language: 'en', // Can be made configurable
        response_format: 'json'
      })

      const text = transcription.text?.trim()
      
      if (!text) {
        return NextResponse.json({ 
          error: 'No speech detected in audio' 
        }, { status: 400 })
      }

      return NextResponse.json({ 
        text,
        confidence: 1.0 // Whisper doesn't provide confidence scores
      })

    } catch (groqError: any) {
      console.error('Groq Whisper API error:', groqError)
      
      // Handle specific Groq API errors
      if (groqError.status === 429) {
        return NextResponse.json(
          { error: 'Rate limit exceeded. Please try again in a moment.' },
          { status: 429 }
        )
      }
      
      if (groqError.status === 401) {
        return NextResponse.json(
          { error: 'Groq API authentication failed. Please check configuration.' },
          { status: 500 }
        )
      }
      
      return NextResponse.json(
        { error: 'Failed to transcribe audio. Please try again.' },
        { status: 500 }
      )
    }

  } catch (error) {
    console.error('Transcription API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}