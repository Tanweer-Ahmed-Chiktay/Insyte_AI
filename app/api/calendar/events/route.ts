import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { GoogleCalendarProvider } from '@/lib/calendar/google-calendar-provider'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Initialize Google Calendar provider from session
    const googleCalendar = await GoogleCalendarProvider.fromSession()

    // Get query parameters
    const { searchParams } = new URL(request.url)
    const timeMin = searchParams.get('timeMin') || new Date().toISOString()
    const timeMax = searchParams.get('timeMax') || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days from now

    // Fetch events from Google Calendar
    const events = await googleCalendar.getEvents(timeMin, timeMax)

    return NextResponse.json({
      events,
      timeMin,
      timeMax
    })

  } catch (error) {
    console.error('Calendar API Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch calendar events' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { title, description, start, end, location, attendees } = body

    if (!title || !start || !end) {
      return NextResponse.json(
        { error: 'Title, start, and end are required' },
        { status: 400 }
      )
    }

    // Initialize Google Calendar provider from session
    const googleCalendar = await GoogleCalendarProvider.fromSession()

    // Create event
    const newEvent = await googleCalendar.createEvent({
      title,
      description,
      start,
      end,
      location,
      attendees
    })

    return NextResponse.json({
      event: newEvent,
      message: 'Event created successfully'
    })

  } catch (error) {
    console.error('Calendar API Error:', error)
    return NextResponse.json(
      { error: 'Failed to create calendar event' },
      { status: 500 }
    )
  }
}