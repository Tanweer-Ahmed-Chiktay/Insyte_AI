import { WebClient } from '@slack/web-api';
import { BaseProvider } from './base-provider';

export interface SlackChannel {
  id: string;
  name: string;
  isPrivate: boolean;
  memberCount?: number;
  unreadCount?: number;
  topic?: string;
  purpose?: string;
}

export interface SlackMessage {
  id: string;
  text: string;
  user: string;
  username?: string;
  timestamp: Date;
  reactions?: {
    name: string;
    count: number;
    users: string[];
  }[];
  attachments?: any[];
  files?: any[];
}

export interface SlackUser {
  id: string;
  name: string;
  realName?: string;
  email?: string;
  avatar?: string;
  isBot?: boolean;
}

export class SlackProvider extends BaseProvider {
  private client: WebClient;

  constructor(accessToken: string, email: string) {
    super(accessToken, email);
    this.client = new WebClient(accessToken);
  }

  async getChannels(): Promise<SlackChannel[]> {
    try {
      const response = await this.client.conversations.list({
        types: 'public_channel,private_channel,mpim,im',
        exclude_archived: true,
        limit: 200
      });

      return response.channels?.map(channel => ({
        id: channel.id!,
        name: channel.name || 'Direct Message',
        isPrivate: channel.is_private || false,
        memberCount: channel.num_members,
        unreadCount: (channel as any).unread_count || 0,
        topic: channel.topic?.value,
        purpose: channel.purpose?.value
      })) || [];
    } catch (error) {
      console.error('[Slack Provider] Error fetching channels:', error);
      throw error;
    }
  }

  async getMessages(channelId: string, limit = 100, cursor?: string): Promise<{
    messages: SlackMessage[];
    hasMore: boolean;
    nextCursor?: string;
  }> {
    try {
      const response = await this.client.conversations.history({
        channel: channelId,
        limit,
        cursor
      });

      const messages = response.messages?.map(message => ({
        id: message.ts!,
        text: message.text || '',
        user: message.user || '',
        username: message.username,
        timestamp: new Date(parseFloat(message.ts!) * 1000),
        reactions: message.reactions?.map(r => ({
          name: r.name!,
          count: r.count!,
          users: r.users || []
        })),
        attachments: message.attachments,
        files: message.files
      })) || [];

      return {
        messages,
        hasMore: response.has_more || false,
        nextCursor: response.response_metadata?.next_cursor
      };
    } catch (error) {
      console.error('[Slack Provider] Error fetching messages:', error);
      throw error;
    }
  }

  async sendMessage(channelId: string, text: string): Promise<string> {
    try {
      const response = await this.client.chat.postMessage({
        channel: channelId,
        text
      });

      return response.ts!;
    } catch (error) {
      console.error('[Slack Provider] Error sending message:', error);
      throw error;
    }
  }

  async uploadFile(channelId: string, file: Buffer, filename: string, title?: string): Promise<any> {
    try {
      const response = await this.client.files.upload({
        channels: channelId,
        file,
        filename,
        title: title || filename
      });

      return response.file;
    } catch (error) {
      console.error('[Slack Provider] Error uploading file:', error);
      throw error;
    }
  }

  async getUsers(): Promise<SlackUser[]> {
    try {
      const response = await this.client.users.list({
        limit: 200
      });

      return response.members?.map(user => ({
        id: user.id!,
        name: user.name!,
        realName: user.real_name,
        email: user.profile?.email,
        avatar: user.profile?.image_72,
        isBot: user.is_bot
      })) || [];
    } catch (error) {
      console.error('[Slack Provider] Error fetching users:', error);
      throw error;
    }
  }

  async getWorkspaceInfo(): Promise<{
    id: string;
    name: string;
    domain: string;
    url: string;
  }> {
    try {
      const response = await this.client.team.info();
      const team = response.team!;

      return {
        id: team.id!,
        name: team.name!,
        domain: team.domain!,
        url: team.url!
      };
    } catch (error) {
      console.error('[Slack Provider] Error fetching workspace info:', error);
      throw error;
    }
  }

  async searchMessages(query: string, count = 20): Promise<SlackMessage[]> {
    try {
      const response = await this.client.search.messages({
        query,
        count
      });

      return response.messages?.matches?.map(match => ({
        id: match.ts!,
        text: match.text || '',
        user: match.user || '',
        username: match.username,
        timestamp: new Date(parseFloat(match.ts!) * 1000)
      })) || [];
    } catch (error) {
      console.error('[Slack Provider] Error searching messages:', error);
      throw error;
    }
  }

  async markChannelAsRead(channelId: string, timestamp: string): Promise<void> {
    try {
      await this.client.conversations.mark({
        channel: channelId,
        ts: timestamp
      });
    } catch (error) {
      console.error('[Slack Provider] Error marking channel as read:', error);
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.auth.test();
      return response.ok || false;
    } catch (error) {
      console.error('[Slack Provider] Connection test failed:', error);
      return false;
    }
  }
}