import { Client } from '@microsoft/microsoft-graph-client';
import { BaseEmailProvider, EmailMessage, SendEmailRequest, EmailListOptions, EmailListResponse } from './base-email-provider';

export class OutlookProvider extends BaseEmailProvider {
  private graphClient: Client;

  constructor(accessToken: string, email: string, refreshToken?: string) {
    super(accessToken, email, refreshToken);
    this.graphClient = Client.init({
      authProvider: async () => {
        return this.accessToken;
      },
    });
  }

  async getEmails(options: EmailListOptions = {}): Promise<EmailListResponse> {
    try {
      const { maxResults = 50, pageToken, query } = options;
      
      let requestUrl = '/me/messages';
      const params = new URLSearchParams();
      
      params.append('$top', maxResults.toString());
      params.append('$orderby', 'receivedDateTime desc');
      
      if (query) {
        params.append('$search', `"${query}"`);
      }
      
      if (pageToken) {
        params.append('$skip', pageToken);
      }
      
      requestUrl += '?' + params.toString();
      
      const response = await this.graphClient.api(requestUrl).get();
      
      const emails: EmailMessage[] = response.value.map((message: any) => 
        this.parseOutlookMessage(message)
      ).filter(Boolean);

      return {
        emails,
        nextPageToken: response['@odata.nextLink'] ? 
          new URL(response['@odata.nextLink']).searchParams.get('$skip') || undefined : undefined,
        totalCount: emails.length,
      };
    } catch (error) {
      console.error('Error fetching emails from Outlook:', error);
      throw new Error('Failed to fetch emails from Outlook');
    }
  }

  async getEmail(id: string): Promise<EmailMessage> {
    try {
      const response = await this.graphClient.api(`/me/messages/${id}`).get();
      
      const email = this.parseOutlookMessage(response);
      if (!email) {
        throw new Error('Failed to parse email message');
      }

      return email;
    } catch (error) {
      console.error('Error fetching email from Outlook:', error);
      throw new Error('Failed to fetch email from Outlook');
    }
  }

  async sendEmail(email: SendEmailRequest): Promise<{ id: string; threadId?: string }> {
    try {
      const message = {
        subject: email.subject,
        body: {
          contentType: 'HTML',
          content: email.htmlBody,
        },
        toRecipients: email.to.map(addr => ({
          emailAddress: { address: addr },
        })),
        ccRecipients: email.cc?.map(addr => ({
          emailAddress: { address: addr },
        })) || [],
        bccRecipients: email.bcc?.map(addr => ({
          emailAddress: { address: addr },
        })) || [],
      };

      const response = await this.graphClient.api('/me/sendMail').post({
        message,
        saveToSentItems: true,
      });

      return {
        id: response.id || 'sent',
        threadId: response.conversationId,
      };
    } catch (error) {
      console.error('Error sending email via Outlook:', error);
      throw new Error('Failed to send email via Outlook');
    }
  }

  async markAsRead(id: string): Promise<void> {
    await this.graphClient.api(`/me/messages/${id}`).patch({
      isRead: true,
    });
  }

  async markAsUnread(id: string): Promise<void> {
    await this.graphClient.api(`/me/messages/${id}`).patch({
      isRead: false,
    });
  }

  async starEmail(id: string): Promise<void> {
    await this.graphClient.api(`/me/messages/${id}`).patch({
      flag: {
        flagStatus: 'flagged',
      },
    });
  }

  async unstarEmail(id: string): Promise<void> {
    await this.graphClient.api(`/me/messages/${id}`).patch({
      flag: {
        flagStatus: 'notFlagged',
      },
    });
  }

  async deleteEmail(id: string): Promise<void> {
    await this.graphClient.api(`/me/messages/${id}`).delete();
  }

  async getLabels(): Promise<{ id: string; name: string; type: string }[]> {
    try {
      const response = await this.graphClient.api('/me/mailFolders').get();
      
      return response.value.map((folder: any) => ({
        id: folder.id,
        name: folder.displayName,
        type: folder.wellKnownName || 'custom',
      }));
    } catch (error) {
      console.error('Error fetching Outlook folders:', error);
      return [];
    }
  }

  async addLabel(emailId: string, labelId: string): Promise<void> {
    // Move email to folder (Outlook doesn't have labels like Gmail)
    await this.graphClient.api(`/me/messages/${emailId}/move`).post({
      destinationId: labelId,
    });
  }

  async removeLabel(emailId: string, labelId: string): Promise<void> {
    // Move email back to inbox
    const inboxFolder = await this.graphClient.api('/me/mailFolders/inbox').get();
    await this.graphClient.api(`/me/messages/${emailId}/move`).post({
      destinationId: inboxFolder.id,
    });
  }

  async refreshAccessToken(): Promise<string> {
    // This would typically involve using MSAL to refresh the token
    // For now, we'll throw an error as this needs to be handled at the auth level
    throw new Error('Token refresh must be handled by the authentication system');
  }

  private parseOutlookMessage(message: any): EmailMessage | null {
    try {
      const subject = message.subject || '';
      const from = message.from?.emailAddress?.address || '';
      const to = message.toRecipients?.map((r: any) => r.emailAddress.address) || [];
      const cc = message.ccRecipients?.map((r: any) => r.emailAddress.address) || [];
      const bcc = message.bccRecipients?.map((r: any) => r.emailAddress.address) || [];
      
      const content = message.body?.content || '';
      const snippet = message.bodyPreview || '';
      
      const isRead = message.isRead || false;
      const isStarred = message.flag?.flagStatus === 'flagged';
      const isImportant = message.importance === 'high';
      const isSpam = message.parentFolderId?.includes('junkemail') || false;
      const isTrash = message.parentFolderId?.includes('deleteditems') || false;
      const isDraft = message.isDraft || false;
      
      const hasAttachments = message.hasAttachments || false;
      const attachments = hasAttachments ? this.extractAttachments(message) : [];
      
      const receivedAt = new Date(message.receivedDateTime);

      return {
        id: message.id,
        threadId: message.conversationId,
        subject,
        from,
        to,
        cc,
        bcc,
        content,
        snippet,
        labels: [message.parentFolderId],
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
      console.error('Error parsing Outlook message:', error);
      return null;
    }
  }

  private extractAttachments(message: any): any[] {
    if (!message.attachments) return [];
    
    return message.attachments.map((attachment: any) => ({
      filename: attachment.name,
      mimeType: attachment.contentType,
      size: attachment.size,
      attachmentId: attachment.id,
    }));
  }
}