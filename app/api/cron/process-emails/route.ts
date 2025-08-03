import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Simple cron job endpoint to process scheduled emails
export async function GET(request: NextRequest) {
  try {
    // Call the process-scheduled-emails endpoint
    const response = await fetch(`${process.env.NEXTAUTH_URL}/api/process-scheduled-emails`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const result = await response.json()

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result
    })

  } catch (error) {
    console.error('Cron job error:', error)
    return NextResponse.json(
      { 
        error: 'Failed to process scheduled emails',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}

// Also allow POST for manual triggering
export async function POST(request: NextRequest) {
  return GET(request)
}