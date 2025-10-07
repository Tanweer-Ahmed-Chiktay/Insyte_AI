import { google } from 'googleapis';
import { BaseCalendarProvider, CalendarEvent, CreateEventRequest, EventListOptions, EventListResponse } from './base-calendar-provider';

export class GoogleCalendarProvider extends BaseCalendarProvider {
  private calendar: any;
  private oauth2Client: any;

  constructor(accessToken: string, email: string, refreshToken?: string) {
    super(accessToken, email, refreshToken);
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.NEXTAUTH_URL + '/api/auth/callback/google'
    );
    this.oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
  }

  async getEvents(options: EventListOptions = {}): Promise<EventListResponse> {
    try {
      const {
        startDate = new Date(),
        endDate,
        maxResults = 50,
        pageToken,
        query
      } = options;

      const params: any = {
        calendarId: 'primary',
        timeMin: startDate.toISOString(),
        maxResults,
        singleEvents: true,
        orderBy: 'startTime',
        pageToken,
      };

      if (endDate) {
        params.timeMax = endDate.toISOString();
      }

      if (query) {
        params.q = query;
      }

      const response = await this.calendar.events.list(params);
      
      const events: CalendarEvent[] = response.data.items.map((event: any) => 
        this.parseGoogleEvent(event)
      ).filter(Boolean);

      return {
        events,
        nextPageToken: response.data.nextPageToken,
        totalCount: events.length,
      };
    } catch (error) {
      console.error('Error fetching events from Google Calendar:', error);
      throw new Error('Failed to fetch events from Google Calendar');
    }
  }

  async getEvent(id: string): Promise<CalendarEvent> {
    try {
      const response = await this.calendar.events.get({
        calendarId: 'primary',
        eventId: id,
      });

      const event = this.parseGoogleEvent(response.data);
      if (!event) {
        throw new Error('Failed to parse calendar event');
      }

      return event;
    } catch (error) {
      console.error('Error fetching event from Google Calendar:', error);
      throw new Error('Failed to fetch event from Google Calendar');
    }
  }

  async createEvent(event: CreateEventRequest): Promise<{ id: string }> {
    try {
      const googleEvent = this.createGoogleEvent(event);
      
      const response = await this.calendar.events.insert({
        calendarId: 'primary',
        requestBody: googleEvent,
      });

      return { id: response.data.id };
    } catch (error) {
      console.error('Error creating event in Google Calendar:', error);
      throw new Error('Failed to create event in Google Calendar');
    }
  }

  async updateEvent(id: string, event: Partial<CreateEventRequest>): Promise<void> {
    try {
      const googleEvent = this.createGoogleEvent(event as CreateEventRequest);
      
      await this.calendar.events.update({
        calendarId: 'primary',
        eventId: id,
        requestBody: googleEvent,
      });
    } catch (error) {
      console.error('Error updating event in Google Calendar:', error);
      throw new Error('Failed to update event in Google Calendar');
    }
  }

  async deleteEvent(id: string): Promise<void> {
    try {
      await this.calendar.events.delete({
        calendarId: 'primary',
        eventId: id,
      });
    } catch (error) {
      console.error('Error deleting event from Google Calendar:', error);
      throw new Error('Failed to delete event from Google Calendar');
    }
  }

  async getCalendars(): Promise<{ id: string; name: string; primary: boolean }[]> {
    try {
      const response = await this.calendar.calendarList.list();
      
      return response.data.items.map((calendar: any) => ({
        id: calendar.id,
        name: calendar.summary,
        primary: calendar.primary || false,
      }));
    } catch (error) {
      console.error('Error fetching calendars from Google Calendar:', error);
      return [];
    }
  }

  async refreshAccessToken(): Promise<string> {
    try {
      const { credentials } = await this.oauth2Client.refreshAccessToken();
      this.accessToken = credentials.access_token;
      this.oauth2Client.setCredentials(credentials);
      return credentials.access_token;
    } catch (error) {
      console.error('Error refreshing access token:', error);
      throw new Error('Failed to refresh access token');
    }
  }

  private parseGoogleEvent(event: any): CalendarEvent | null {
    try {
      const startTime = event.start?.dateTime ? 
        new Date(event.start.dateTime) : 
        new Date(event.start.date);
      
      const endTime = event.end?.dateTime ? 
        new Date(event.end.dateTime) : 
        new Date(event.end.date);
      
      const isAllDay = !event.start?.dateTime;
      
      const attendees = event.attendees?.map((attendee: any) => ({
        email: attendee.email,
        name: attendee.displayName,
        status: this.mapGoogleAttendeeStatus(attendee.responseStatus),
      })) || [];

      return {
        id: event.id,
        title: event.summary || 'Untitled Event',
        description: event.description,
        location: event.location,
        startTime,
        endTime,
        isAllDay,
        attendees,
        recurrence: this.parseRecurrence(event.recurrence),
        status: this.mapGoogleEventStatus(event.status),
        visibility: this.mapGoogleVisibility(event.visibility),
        createdAt: new Date(event.created),
        updatedAt: new Date(event.updated),
      };
    } catch (error) {
      console.error('Error parsing Google Calendar event:', error);
      return null;
    }
  }

  private createGoogleEvent(event: CreateEventRequest): any {
    const googleEvent: any = {
      summary: event.title,
      description: event.description,
      location: event.location,
      start: event.isAllDay ? 
        { date: event.startTime.toISOString().split('T')[0] } :
        { dateTime: event.startTime.toISOString() },
      end: event.isAllDay ? 
        { date: event.endTime.toISOString().split('T')[0] } :
        { dateTime: event.endTime.toISOString() },
      attendees: event.attendees?.map(attendee => ({
        email: attendee.email,
        displayName: attendee.name,
      })),
      visibility: event.visibility || 'default',
    };

    if (event.recurrence) {
      googleEvent.recurrence = this.createGoogleRecurrence(event.recurrence);
    }

    return googleEvent;
  }

  private mapGoogleAttendeeStatus(status: string): 'accepted' | 'declined' | 'tentative' | 'needsAction' {
    switch (status) {
      case 'accepted': return 'accepted';
      case 'declined': return 'declined';
      case 'tentative': return 'tentative';
      default: return 'needsAction';
    }
  }

  private mapGoogleEventStatus(status: string): 'confirmed' | 'tentative' | 'cancelled' {
    switch (status) {
      case 'confirmed': return 'confirmed';
      case 'tentative': return 'tentative';
      case 'cancelled': return 'cancelled';
      default: return 'confirmed';
    }
  }

  private mapGoogleVisibility(visibility: string): 'default' | 'public' | 'private' {
    switch (visibility) {
      case 'public': return 'public';
      case 'private': return 'private';
      default: return 'default';
    }
  }

  private parseRecurrence(recurrence: string[]): any {
    if (!recurrence || recurrence.length === 0) return undefined;
    
    // Basic RRULE parsing - this could be expanded
    const rrule = recurrence[0];
    const freq = rrule.match(/FREQ=([^;]+)/)?.[1];
    const interval = rrule.match(/INTERVAL=([^;]+)/)?.[1];
    const until = rrule.match(/UNTIL=([^;]+)/)?.[1];
    const count = rrule.match(/COUNT=([^;]+)/)?.[1];

    if (!freq) return undefined;

    return {
      frequency: freq.toLowerCase() as any,
      interval: interval ? parseInt(interval) : 1,
      until: until ? new Date(until) : undefined,
      count: count ? parseInt(count) : undefined,
    };
  }

  private createGoogleRecurrence(recurrence: any): string[] {
    let rrule = `FREQ=${recurrence.frequency.toUpperCase()}`;
    
    if (recurrence.interval && recurrence.interval > 1) {
      rrule += `;INTERVAL=${recurrence.interval}`;
    }
    
    if (recurrence.until) {
      rrule += `;UNTIL=${recurrence.until.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
    } else if (recurrence.count) {
      rrule += `;COUNT=${recurrence.count}`;
    }

    return [rrule];
  }
}