import { google } from 'googleapis';
import { BaseEmailProvider, EmailMessage, SendEmailRequest, EmailListOptions, EmailListResponse } from './base-email-provider';

export class GmailProvider extends BaseEmailProvider {
  private gmail: any;
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
    this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
  }

  async getEmails(options: EmailListOptions = {}): Promise<EmailListResponse> {
    try {
      const { maxResults = 50, pageToken, query, labelIds } = options;
      
      const listParams: any = {
        userId: 'me',
        maxResults,
        pageToken,
        q: query,
        labelIds,
      };

      const response = await this.gmail.users.messages.list(listParams);
      const messages = response.data.messages || [];

      const emails: EmailMessage[] = [];
      
      // Use batch processing to reduce API calls and avoid rate limits
      if (messages.length > 0) {
        const { getBatchProcessor } = await import('../gmail-batch-processor');
        const batchProcessor = getBatchProcessor(this.oauth2Client.credentials.access_token);
        
        const messageIds = messages.map((msg: any) => msg.id);
        const batchResults = await batchProcessor.fetchMessagesBatch(messageIds, 'full');
        
        for (const result of batchResults) {
          if (result.success && result.data) {
            const email = this.parseGmailMessage(result.data);
            if (email) emails.push(email);
          } else {
            console.warn(`Failed to fetch message ${result.messageId}:`, result.error);
          }
        }
      }

      return {
        emails,
        nextPageToken: response.data.nextPageToken,
        totalCount: response.data.resultSizeEstimate,
      };
    } catch (error) {
      console.error('Error fetching emails:', error);
      
      // Handle rate limiting with exponential backoff
      if (this.isRateLimitError(error)) {
        throw new Error('Gmail API rate limit exceeded. Please try again in a few minutes.');
      }
      
      throw new Error('Failed to fetch emails from Gmail');
    }
  }

  private isRateLimitError(error: any): boolean {
    return error?.code === 429 || 
           error?.status === 429 ||
           (error?.message && error.message.toLowerCase().includes('quota')) ||
           (error?.message && error.message.toLowerCase().includes('rate limit'));
  }

  private async retryWithBackoff<T>(operation: () => Promise<T>, maxRetries = 3): Promise<T> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (attempt === maxRetries || !this.isRateLimitError(error)) {
          throw error;
        }
        
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000); // Max 10 seconds
        console.log(`Rate limit hit, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw new Error('Max retries exceeded');
  }

  async getEmail(id: string): Promise<EmailMessage> {
    try {
      const response = await this.retryWithBackoff(() => 
        this.gmail.users.messages.get({
          userId: 'me',
          id,
          format: 'full'
        })
      ) as { data: any };
      
      const email = this.parseGmailMessage(response.data);
      if (!email) {
        throw new Error('Failed to parse email message');
      }
      
      return email;
    } catch (error) {
      console.error('Error fetching email:', error);
      
      if (this.isRateLimitError(error)) {
        throw new Error('Gmail API rate limit exceeded. Please try again in a few minutes.');
      }
      
      throw new Error('Failed to fetch email from Gmail');
    }
  }

  async sendEmail(email: SendEmailRequest): Promise<{ id: string; threadId?: string }> {
    try {
      const message = this.createEmailMessage(email);
      
      const response = await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: message,
        },
      });

      return {
        id: response.data.id,
        threadId: response.data.threadId,
      };
    } catch (error) {
      console.error('Error sending email:', error);
      throw new Error('Failed to send email via Gmail');
    }
  }

  async markAsRead(id: string): Promise<void> {
    await this.gmail.users.messages.modify({
      userId: 'me',
      id,
      requestBody: {
        removeLabelIds: ['UNREAD'],
      },
    });
  }

  async markAsUnread(id: string): Promise<void> {
    await this.gmail.users.messages.modify({
      userId: 'me',
      id,
      requestBody: {
        addLabelIds: ['UNREAD'],
      },
    });
  }

  async starEmail(id: string): Promise<void> {
    await this.gmail.users.messages.modify({
      userId: 'me',
      id,
      requestBody: {
        addLabelIds: ['STARRED'],
      },
    });
  }

  async unstarEmail(id: string): Promise<void> {
    await this.gmail.users.messages.modify({
      userId: 'me',
      id,
      requestBody: {
        removeLabelIds: ['STARRED'],
      },
    });
  }

  async deleteEmail(id: string): Promise<void> {
    await this.gmail.users.messages.trash({
      userId: 'me',
      id,
    });
  }

  async getLabels(): Promise<{ id: string; name: string; type: string }[]> {
    const response = await this.gmail.users.labels.list({
      userId: 'me',
    });

    return response.data.labels.map((label: any) => ({
      id: label.id,
      name: label.name,
      type: label.type,
    }));
  }

  async addLabel(emailId: string, labelId: string): Promise<void> {
    await this.gmail.users.messages.modify({
      userId: 'me',
      id: emailId,
      requestBody: {
        addLabelIds: [labelId],
      },
    });
  }

  async removeLabel(emailId: string, labelId: string): Promise<void> {
    await this.gmail.users.messages.modify({
      userId: 'me',
      id: emailId,
      requestBody: {
        removeLabelIds: [labelId],
      },
    });
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

  private parseGmailMessage(message: any): EmailMessage | null {
    try {
      const headers = message.payload.headers;
      const getHeader = (name: string) => 
        headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

      const subject = getHeader('Subject');
      const from = getHeader('From');
      const to = getHeader('To').split(',').map((email: string) => email.trim());
      const cc = getHeader('Cc').split(',').map((email: string) => email.trim()).filter(Boolean);
      const bcc = getHeader('Bcc').split(',').map((email: string) => email.trim()).filter(Boolean);
      
      const content = this.extractEmailContent(message.payload);
      const snippet = message.snippet || '';
      
      const labelIds = message.labelIds || [];
      const isRead = !labelIds.includes('UNREAD');
      const isStarred = labelIds.includes('STARRED');
      const isImportant = labelIds.includes('IMPORTANT');
      const isSpam = labelIds.includes('SPAM');
      const isTrash = labelIds.includes('TRASH');
      const isDraft = labelIds.includes('DRAFT');
      
      const hasAttachments = this.hasAttachments(message.payload);
      const attachments = hasAttachments ? this.extractAttachments(message.payload) : [];
      
      const receivedAt = new Date(parseInt(message.internalDate));

      return {
        id: message.id,
        threadId: message.threadId,
        subject,
        from,
        to,
        cc,
        bcc,
        content,
        snippet,
        labels: labelIds,
        isRead,
        isStarred,
        isImportant,
        isSpam,
        isTrash,
        isDraft,
        hasAttachments,
        attachments,
        receivedAt,
      };
    } catch (error) {
      console.error('Error parsing Gmail message:', error);
      return null;
    }
  }

  private extractEmailContent(payload: any): string {
    if (payload.body?.data) {
      return Buffer.from(payload.body.data, 'base64').toString('utf-8');
    }
    
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/html' || part.mimeType === 'text/plain') {
          if (part.body?.data) {
            return Buffer.from(part.body.data, 'base64').toString('utf-8');
          }
        }
        
        if (part.parts) {
          const content = this.extractEmailContent(part);
          if (content) return content;
        }
      }
    }
    
    return '';
  }

  private hasAttachments(payload: any): boolean {
    if (payload.parts) {
      return payload.parts.some((part: any) => 
        part.filename && part.filename.length > 0
      );
    }
    return false;
  }

  private extractAttachments(payload: any): any[] {
    const attachments: any[] = [];
    
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.filename && part.filename.length > 0) {
          attachments.push({
            filename: part.filename,
            mimeType: part.mimeType,
            size: part.body?.size || 0,
            attachmentId: part.body?.attachmentId,
          });
        }
      }
    }
    
    return attachments;
  }

  private createEmailMessage(email: SendEmailRequest): string {
    const boundary = 'boundary_' + Math.random().toString(36).substr(2, 9);
    
    let message = [
      `To: ${email.to.join(', ')}`,
      email.cc?.length ? `Cc: ${email.cc.join(', ')}` : '',
      email.bcc?.length ? `Bcc: ${email.bcc.join(', ')}` : '',
      `Subject: ${email.subject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: 7bit',
      '',
      email.htmlBody,
      `--${boundary}--`,
    ].filter(Boolean).join('\r\n');

    return Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
}