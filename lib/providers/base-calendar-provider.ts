export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  location?: string;
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
  attendees?: {
    email: string;
    name?: string;
    status?: 'accepted' | 'declined' | 'tentative' | 'needsAction';
  }[];
  recurrence?: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
    interval?: number;
    until?: Date;
    count?: number;
  };
  status: 'confirmed' | 'tentative' | 'cancelled';
  visibility: 'default' | 'public' | 'private';
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateEventRequest {
  title: string;
  description?: string;
  location?: string;
  startTime: Date;
  endTime: Date;
  isAllDay?: boolean;
  attendees?: {
    email: string;
    name?: string;
  }[];
  recurrence?: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
    interval?: number;
    until?: Date;
    count?: number;
  };
  visibility?: 'default' | 'public' | 'private';
}

export interface EventListOptions {
  startDate?: Date;
  endDate?: Date;
  maxResults?: number;
  pageToken?: string;
  query?: string;
}

export interface EventListResponse {
  events: CalendarEvent[];
  nextPageToken?: string;
  totalCount?: number;
}

export abstract class BaseCalendarProvider {
  protected accessToken: string;
  protected refreshToken?: string;
  protected email: string;

  constructor(accessToken: string, email: string, refreshToken?: string) {
    this.accessToken = accessToken;
    this.email = email;
    this.refreshToken = refreshToken;
  }

  abstract getEvents(options?: EventListOptions): Promise<EventListResponse>;
  abstract getEvent(id: string): Promise<CalendarEvent>;
  abstract createEvent(event: CreateEventRequest): Promise<{ id: string }>;
  abstract updateEvent(id: string, event: Partial<CreateEventRequest>): Promise<void>;
  abstract deleteEvent(id: string): Promise<void>;
  abstract getCalendars(): Promise<{ id: string; name: string; primary: boolean }[]>;
  abstract refreshAccessToken(): Promise<string>;
}