export interface EmailMessage {
  id: string;
  threadId?: string;
  subject: string;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  content: string;
  snippet?: string;
  labels?: string[];
  isRead: boolean;
  isStarred: boolean;
  isImportant: boolean;
  isSpam: boolean;
  isTrash: boolean;
  isDraft: boolean;
  hasAttachments: boolean;
  attachments?: any[];
  receivedAt: Date;
}

export interface SendEmailRequest {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  htmlBody: string;
  textBody?: string;
  attachments?: any[];
}

export interface EmailListOptions {
  maxResults?: number;
  pageToken?: string;
  query?: string;
  labelIds?: string[];
}

export interface EmailListResponse {
  emails: EmailMessage[];
  nextPageToken?: string;
  totalCount?: number;
}

export abstract class BaseEmailProvider {
  protected accessToken: string;
  protected refreshToken?: string;
  protected email: string;

  constructor(accessToken: string, email: string, refreshToken?: string) {
    this.accessToken = accessToken;
    this.email = email;
    this.refreshToken = refreshToken;
  }

  abstract getEmails(options?: EmailListOptions): Promise<EmailListResponse>;
  abstract getEmail(id: string): Promise<EmailMessage>;
  abstract sendEmail(email: SendEmailRequest): Promise<{ id: string; threadId?: string }>;
  abstract markAsRead(id: string): Promise<void>;
  abstract markAsUnread(id: string): Promise<void>;
  abstract starEmail(id: string): Promise<void>;
  abstract unstarEmail(id: string): Promise<void>;
  abstract deleteEmail(id: string): Promise<void>;
  abstract archiveEmail(id: string): Promise<void>;
  abstract getLabels(): Promise<{ id: string; name: string; type: string }[]>;
  abstract addLabel(emailId: string, labelId: string): Promise<void>;
  abstract removeLabel(emailId: string, labelId: string): Promise<void>;
  abstract refreshAccessToken(): Promise<string>;
}