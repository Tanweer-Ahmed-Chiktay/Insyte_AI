import { BaseEmailProvider } from './base-email-provider';
import { BaseCalendarProvider } from './base-calendar-provider';
import { GmailProvider } from './gmail-provider';
import { OutlookProvider } from './outlook-provider';
import { GoogleCalendarProvider } from './google-calendar-provider';
import { PrismaClient } from '@prisma/client';

type EmailProviderType = 'gmail' | 'outlook';
type CalendarProviderType = 'google' | 'outlook';

interface ProviderCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  clientId?: string;
  clientSecret?: string;
}

interface EmailProviderConfig {
  id: string;
  type: EmailProviderType;
  userId: string;
  credentials: ProviderCredentials;
  settings?: Record<string, any>;
}

interface CalendarProviderConfig {
  id: string;
  type: CalendarProviderType;
  userId: string;
  credentials: ProviderCredentials;
  settings?: Record<string, any>;
}

class ProviderFactory {
  private prisma: PrismaClient;
  private emailProviders = new Map<string, BaseEmailProvider>();
  private calendarProviders = new Map<string, BaseCalendarProvider>();

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Create or get an email provider instance
   */
  async getEmailProvider(providerId: string): Promise<BaseEmailProvider | null> {
    // Check if provider is already cached
    if (this.emailProviders.has(providerId)) {
      return this.emailProviders.get(providerId)!;
    }

    try {
      // Fetch provider config from database
      const providerConfig = await this.prisma.emailProvider.findUnique({
        where: { id: providerId },
        include: { 
          user: {
            include: {
              accounts: {
                where: {
                  provider: {
                    in: ['google', 'microsoft']
                  }
                }
              }
            }
          }
        }
      });

      if (!providerConfig) {
        console.error(`Email provider not found: ${providerId}`);
        return null;
      }

      // Find the matching account for this provider
      const account = providerConfig.user.accounts.find(acc => 
        (providerConfig.provider === 'gmail' && acc.provider === 'google') ||
        (providerConfig.provider === 'outlook' && acc.provider === 'microsoft')
      );

      if (!account || !account.access_token) {
        console.error(`No valid account found for provider ${providerId}`);
        return null;
      }

      const provider = this.createEmailProvider({
        id: providerConfig.id,
        type: providerConfig.provider as EmailProviderType,
        userId: providerConfig.userId,
        credentials: {
          accessToken: account.access_token,
          refreshToken: account.refresh_token || undefined,
          expiresAt: account.expires_at ? new Date(account.expires_at * 1000) : undefined,
        },
        settings: providerConfig.settings as Record<string, any> || {}
      });

      if (provider) {
        this.emailProviders.set(providerId, provider);
      }

      return provider;
    } catch (error) {
      console.error(`Error getting email provider ${providerId}:`, error);
      return null;
    }
  }

  /**
   * Create or get a calendar provider instance
   */
  async getCalendarProvider(providerId: string): Promise<BaseCalendarProvider | null> {
    // Check if provider is already cached
    if (this.calendarProviders.has(providerId)) {
      return this.calendarProviders.get(providerId)!;
    }

    try {
      // Fetch provider config from database
      const providerConfig = await this.prisma.calendarProvider.findUnique({
        where: { id: providerId },
        include: { 
          user: {
            include: {
              accounts: {
                where: {
                  provider: {
                    in: ['google', 'microsoft']
                  }
                }
              }
            }
          }
        }
      });

      if (!providerConfig) {
        console.error(`Calendar provider not found: ${providerId}`);
        return null;
      }

      // Find the matching account for this provider
      const account = providerConfig.user.accounts.find(acc => 
        (providerConfig.provider === 'google' && acc.provider === 'google') ||
        (providerConfig.provider === 'outlook' && acc.provider === 'microsoft')
      );

      if (!account || !account.access_token) {
        console.error(`No valid account found for calendar provider ${providerId}`);
        return null;
      }

      const provider = this.createCalendarProvider({
        id: providerConfig.id,
        type: providerConfig.provider as CalendarProviderType,
        userId: providerConfig.userId,
        credentials: {
          accessToken: account.access_token,
          refreshToken: account.refresh_token || undefined,
          expiresAt: account.expires_at ? new Date(account.expires_at * 1000) : undefined,
        },
        settings: providerConfig.settings as Record<string, any> || {}
      });

      if (provider) {
        this.calendarProviders.set(providerId, provider);
      }

      return provider;
    } catch (error) {
      console.error(`Error getting calendar provider ${providerId}:`, error);
      return null;
    }
  }

  /**
   * Get all email providers for a user
   */
  async getUserEmailProviders(userId: string): Promise<BaseEmailProvider[]> {
    try {
      const providerConfigs = await this.prisma.emailProvider.findMany({
        where: { userId },
        include: { user: true }
      });

      const providers: BaseEmailProvider[] = [];
      
      for (const config of providerConfigs) {
        const provider = await this.getEmailProvider(config.id);
        if (provider) {
          providers.push(provider);
        }
      }

      return providers;
    } catch (error) {
      console.error(`Error getting user email providers for ${userId}:`, error);
      return [];
    }
  }

  /**
   * Get all calendar providers for a user
   */
  async getUserCalendarProviders(userId: string): Promise<BaseCalendarProvider[]> {
    try {
      const providerConfigs = await this.prisma.calendarProvider.findMany({
        where: { userId },
        include: { user: true }
      });

      const providers: BaseCalendarProvider[] = [];
      
      for (const config of providerConfigs) {
        const provider = await this.getCalendarProvider(config.id);
        if (provider) {
          providers.push(provider);
        }
      }

      return providers;
    } catch (error) {
      console.error(`Error getting user calendar providers for ${userId}:`, error);
      return [];
    }
  }

  /**
   * Create a new email provider instance
   */
  private createEmailProvider(config: EmailProviderConfig): BaseEmailProvider | null {
    switch (config.type) {
      case 'gmail':
        return new GmailProvider(
          config.credentials.accessToken,
          config.credentials.refreshToken || '',
          config.userId
        );
      case 'outlook':
        return new OutlookProvider(
          config.credentials.accessToken,
          config.credentials.refreshToken || '',
          config.userId
        );
      default:
        console.error(`Unknown email provider type: ${config.type}`);
        return null;
    }
  }

  /**
   * Create a new calendar provider instance
   */
  private createCalendarProvider(config: CalendarProviderConfig): BaseCalendarProvider | null {
    switch (config.type) {
      case 'google':
        return new GoogleCalendarProvider(
          config.credentials.accessToken,
          config.credentials.refreshToken || '',
          config.userId
        );
      case 'outlook':
        // TODO: Implement OutlookCalendarProvider
        console.warn('Outlook calendar provider not yet implemented');
        return null;
      default:
        console.error(`Unknown calendar provider type: ${config.type}`);
        return null;
    }
  }

  /**
   * Update provider credentials in database and cache
   */
  async updateEmailProviderCredentials(
    providerId: string,
    credentials: Partial<ProviderCredentials>
  ): Promise<void> {
    try {
      // Get the email provider to find the associated user and account
      const emailProvider = await this.prisma.emailProvider.findUnique({
        where: { id: providerId },
        include: { user: true }
      });

      if (!emailProvider) {
        throw new Error(`Email provider ${providerId} not found`);
      }

      // Update the account credentials instead
      const accountProvider = emailProvider.provider === 'gmail' ? 'google' : 'microsoft';
      await this.prisma.account.updateMany({
        where: {
          userId: emailProvider.userId,
          provider: accountProvider
        },
        data: {
          access_token: credentials.accessToken,
          refresh_token: credentials.refreshToken,
          expires_at: credentials.expiresAt ? Math.floor(credentials.expiresAt.getTime() / 1000) : undefined
        }
      });

      // Remove from cache to force refresh on next access
      this.emailProviders.delete(providerId);
    } catch (error) {
      console.error(`Error updating email provider credentials ${providerId}:`, error);
      throw error;
    }
  }

  /**
   * Update calendar provider credentials in database and cache
   */
  async updateCalendarProviderCredentials(
    providerId: string,
    credentials: Partial<ProviderCredentials>
  ): Promise<void> {
    try {
      // Get the calendar provider to find the associated user and account
      const calendarProvider = await this.prisma.calendarProvider.findUnique({
        where: { id: providerId },
        include: { user: true }
      });

      if (!calendarProvider) {
        throw new Error(`Calendar provider ${providerId} not found`);
      }

      // Update the account credentials instead
      const accountProvider = calendarProvider.provider === 'google' ? 'google' : 'microsoft';
      await this.prisma.account.updateMany({
        where: {
          userId: calendarProvider.userId,
          provider: accountProvider
        },
        data: {
          access_token: credentials.accessToken,
          refresh_token: credentials.refreshToken,
          expires_at: credentials.expiresAt ? Math.floor(credentials.expiresAt.getTime() / 1000) : undefined
        }
      });

      // Remove from cache to force refresh on next access
      this.calendarProviders.delete(providerId);
    } catch (error) {
      console.error(`Error updating calendar provider credentials ${providerId}:`, error);
      throw error;
    }
  }

  /**
   * Remove provider from cache
   */
  invalidateEmailProvider(providerId: string): void {
    this.emailProviders.delete(providerId);
  }

  /**
   * Remove calendar provider from cache
   */
  invalidateCalendarProvider(providerId: string): void {
    this.calendarProviders.delete(providerId);
  }

  /**
   * Clear all cached providers
   */
  clearCache(): void {
    this.emailProviders.clear();
    this.calendarProviders.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { emailProviders: number; calendarProviders: number } {
    return {
      emailProviders: this.emailProviders.size,
      calendarProviders: this.calendarProviders.size
    };
  }
}

// Export types and factory
export { ProviderFactory };
export type {
  EmailProviderType,
  CalendarProviderType,
  ProviderCredentials,
  EmailProviderConfig,
  CalendarProviderConfig
};