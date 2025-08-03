import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import Groq from 'groq-sdk'
import { authOptions } from '@/lib/auth'

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
      return NextResponse.json({ error: 'AI service not configured' }, { status: 500 })
    }

    const { type, context, tone = 'professional', length = 'medium' } = await request.json()

    // Input validation
    if (!type || !context || typeof type !== 'string' || typeof context !== 'string') {
      return NextResponse.json({ error: 'Valid type and context are required' }, { status: 400 })
    }

    // Validate allowed values
    const allowedTypes = ['reply', 'compose', 'follow-up']
    const allowedTones = ['professional', 'casual', 'formal', 'friendly']
    const allowedLengths = ['short', 'medium', 'long']

    if (!allowedTypes.includes(type)) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
    }

    if (tone && !allowedTones.includes(tone)) {
      return NextResponse.json({ error: 'Invalid tone' }, { status: 400 })
    }

    if (length && !allowedLengths.includes(length)) {
      return NextResponse.json({ error: 'Invalid length' }, { status: 400 })
    }

    // Length validation for context
    if (context.length > 5000) {
      return NextResponse.json({ error: 'Context too long' }, { status: 400 })
    }

    let systemPrompt = ''
    let userPrompt = ''

    switch (type) {
      case 'reply':
        systemPrompt = `You are an AI email assistant. Generate a ${tone} email reply that is ${length} in length. Be helpful, clear, and appropriate for business communication.`
        userPrompt = `Generate a reply to this email:\n\n${context}`
        break
      
      case 'compose':
        systemPrompt = `You are an AI email assistant. Generate a ${tone} email that is ${length} in length. Be helpful, clear, and appropriate for business communication.`
        userPrompt = `Compose an email about: ${context}`
        break
      
      case 'suggestions':
        systemPrompt = 'You are an AI email assistant. Generate 3 different reply suggestions for the given email. Each should be brief (1-2 sentences) and have different tones: professional, friendly, and brief.'
        userPrompt = `Generate reply suggestions for this email:\n\n${context}`
        break
      
      default:
        return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
    }

    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: userPrompt
        }
      ],
      model: 'llama3-8b-8192',
      temperature: 0.7,
      max_tokens: type === 'suggestions' ? 300 : 500
    })

    const result = completion.choices[0]?.message?.content || 'Unable to generate content'

    if (type === 'suggestions') {
      // Parse suggestions into array
      const suggestions = result.split('\n').filter(line => line.trim()).slice(0, 3)
      return NextResponse.json({ suggestions })
    }

    return NextResponse.json({ content: result })
  } catch (error) {
    console.error('Error generating AI content:', error)
    return NextResponse.json(
      { error: 'Failed to generate content' },
      { status: 500 }
    )
  }
}