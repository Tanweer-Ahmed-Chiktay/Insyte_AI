import { google } from 'googleapis'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'

export interface CalendarEvent {
  id: string
  title: string
  description?: string
  start: string
  end: string
  color?: string
  attendees?: string[]
  location?: string
}

export class GoogleCalendarProvider {
  private calendar: any

  constructor(accessToken: string) {
    const auth = new google.auth.OAuth2()
    auth.setCredentials({ access_token: accessToken })
    this.calendar = google.calendar({ version: 'v3', auth })
  }

  static async fromSession() {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      throw new Error('No authenticated user')
    }

    if (!session.accessToken) {
      throw new Error('No Google access token available')
    }

    return new GoogleCalendarProvider(session.accessToken)
  }

  async getEvents(timeMin: string, timeMax: string): Promise<CalendarEvent[]> {
    try {
      const response = await this.calendar.events.list({
        calendarId: 'primary',
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 100
      })

      return response.data.items?.map((event: any) => ({
        id: event.id,
        title: event.summary || 'Untitled Event',
        description: event.description,
        start: event.start?.dateTime || event.start?.date,
        end: event.end?.dateTime || event.end?.date,
        color: this.getEventColor(event.colorId),
        attendees: event.attendees?.map((attendee: any) => attendee.email) || [],
        location: event.location
      })) || []
    } catch (error) {
      console.error('Error fetching calendar events:', error)
      throw new Error('Failed to fetch calendar events')
    }
  }

  async createEvent(eventData: Partial<CalendarEvent>): Promise<CalendarEvent> {
    try {
      const event = {
        summary: eventData.title,
        description: eventData.description,
        start: {
          dateTime: eventData.start,
          timeZone: 'UTC'
        },
        end: {
          dateTime: eventData.end,
          timeZone: 'UTC'
        },
        location: eventData.location,
        attendees: eventData.attendees?.map(email => ({ email }))
      }

      const response = await this.calendar.events.insert({
        calendarId: 'primary',
        resource: event
      })

      return {
        id: response.data.id,
        title: response.data.summary || 'Untitled Event',
        description: response.data.description,
        start: response.data.start?.dateTime || response.data.start?.date,
        end: response.data.end?.dateTime || response.data.end?.date,
        color: this.getEventColor(response.data.colorId),
        attendees: response.data.attendees?.map((attendee: any) => attendee.email) || [],
        location: response.data.location
      }
    } catch (error) {
      console.error('Error creating calendar event:', error)
      throw new Error('Failed to create calendar event')
    }
  }

  private getEventColor(colorId?: string): string {
    const colorMap: { [key: string]: string } = {
      '1': '#a4bdfc',
      '2': '#7ae7bf',
      '3': '#dbadff',
      '4': '#ff887c',
      '5': '#fbd75b',
      '6': '#ffb878',
      '7': '#46d6db',
      '8': '#e1e1e1',
      '9': '#5484ed',
      '10': '#51b749',
      '11': '#dc2127'
    }
    return colorMap[colorId || '1'] || '#3b82f6'
  }
}