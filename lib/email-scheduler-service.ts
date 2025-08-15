import { PrismaClient } from '@prisma/client';
import { syncGmailHistory, fullGmailSync } from './gmail-sync';
import { GoogleCalendarProvider } from './providers/google-calendar-provider';

interface ScheduledJob {
  id: string;
  userId: string;
  type: 'email_sync' | 'calendar_sync' | 'cleanup';
  interval: number;
  lastRun?: Date;
  nextRun: Date;
  isActive: boolean;
}

class EmailSchedulerService {
  private static instance: EmailSchedulerService | null = null;
  private prisma: PrismaClient;
  private jobs = new Map<string, NodeJS.Timeout>();
  private isInitialized = false;

  private constructor() {
    this.prisma = new PrismaClient();
  }

  static getInstance(): EmailSchedulerService {
    if (!EmailSchedulerService.instance) {
      EmailSchedulerService.instance = new EmailSchedulerService();
    }
    return EmailSchedulerService.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('EmailSchedulerService already initialized');
      return;
    }

    try {
      console.log('Initializing EmailSchedulerService...');
      
      // Load existing jobs from database
      await this.loadJobsFromDatabase();
      
      // Schedule cleanup job
      this.scheduleCleanupJob();
      
      this.isInitialized = true;
      console.log('EmailSchedulerService initialized successfully');
    } catch (error) {
      console.error('Failed to initialize EmailSchedulerService:', error);
      throw error;
    }
  }

  private async loadJobsFromDatabase(): Promise<void> {
    try {
      // This would load scheduled jobs from your database
      // For now, we'll create default sync jobs for active users
      const activeUsers = await this.prisma.account.findMany({
        where: {
          provider: 'google',
          access_token: { not: null }
        },
        select: {
          userId: true
        }
      });

      for (const user of activeUsers) {
        // Schedule email sync every 24 hours
        this.scheduleEmailSync(user.userId, 24 * 60 * 60 * 1000);
        
        // Schedule calendar sync every 15 minutes
        this.scheduleCalendarSync(user.userId, 15 * 60 * 1000);
      }

      console.log(`Loaded sync jobs for ${activeUsers.length} users`);
    } catch (error) {
      console.error('Failed to load jobs from database:', error);
    }
  }

  scheduleEmailSync(userId: string, interval: number): void {
    const jobId = `email_sync_${userId}`;
    
    // Clear existing job if any
    this.clearJob(jobId);
    
    const job = setInterval(async () => {
      try {
        console.log(`Running email sync for user ${userId}`);
        // Get user's account info for sync
        const account = await this.prisma.account.findFirst({
          where: {
            userId,
            provider: 'google',
            access_token: { not: null }
          }
        });
        
        if (account?.access_token && account?.refresh_token) {
          await syncGmailHistory({
            userId,
            accessToken: account.access_token,
            refreshToken: account.refresh_token,
            startHistoryId: account.gmail_history_id || undefined
          });
        }
      } catch (error) {
        console.error(`Email sync failed for user ${userId}:`, error);
      }
    }, interval);
    
    this.jobs.set(jobId, job);
    console.log(`Scheduled email sync for user ${userId} every ${interval}ms`);
  }

  scheduleCalendarSync(userId: string, interval: number): void {
    const jobId = `calendar_sync_${userId}`;
    
    // Clear existing job if any
    this.clearJob(jobId);
    
    const job = setInterval(async () => {
      try {
        console.log(`Running calendar sync for user ${userId}`);
        // Calendar sync implementation would go here
        // await calendarSync.syncCalendar(userId);
      } catch (error) {
        console.error(`Calendar sync failed for user ${userId}:`, error);
      }
    }, interval);
    
    this.jobs.set(jobId, job);
    console.log(`Scheduled calendar sync for user ${userId} every ${interval}ms`);
  }

  private scheduleCleanupJob(): void {
    const jobId = 'cleanup_job';
    
    // Clear existing cleanup job if any
    this.clearJob(jobId);
    
    // Run cleanup every hour
    const job = setInterval(async () => {
      try {
        console.log('Running cleanup job');
        await this.runCleanup();
      } catch (error) {
        console.error('Cleanup job failed:', error);
      }
    }, 60 * 60 * 1000); // 1 hour
    
    this.jobs.set(jobId, job);
    console.log('Scheduled cleanup job every hour');
  }

  private async runCleanup(): Promise<void> {
    try {
      // Clean up old email data, logs, etc.
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      // Example cleanup operations - clean up old trash emails
      await this.prisma.email.deleteMany({
        where: {
          isTrash: true,
          updatedAt: {
            lt: thirtyDaysAgo
          }
        }
      });
      
      console.log('Cleanup completed successfully');
    } catch (error) {
      console.error('Cleanup failed:', error);
    }
  }

  clearJob(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (job) {
      clearInterval(job);
      this.jobs.delete(jobId);
      console.log(`Cleared job: ${jobId}`);
    }
  }

  clearUserJobs(userId: string): void {
    const userJobIds = Array.from(this.jobs.keys()).filter(jobId => 
      jobId.includes(userId)
    );
    
    userJobIds.forEach(jobId => this.clearJob(jobId));
    console.log(`Cleared ${userJobIds.length} jobs for user ${userId}`);
  }

  getActiveJobs(): string[] {
    return Array.from(this.jobs.keys());
  }

  getJobCount(): number {
    return this.jobs.size;
  }

  async shutdown(): Promise<void> {
    console.log('Shutting down EmailSchedulerService...');
    
    // Clear all jobs
    this.jobs.forEach((job, jobId) => {
      clearInterval(job);
      console.log(`Cleared job: ${jobId}`);
    });
    
    this.jobs.clear();
    
    // Disconnect Prisma
    await this.prisma.$disconnect();
    
    this.isInitialized = false;
    EmailSchedulerService.instance = null;
    
    console.log('EmailSchedulerService shutdown complete');
  }
}

// Singleton instance
export const emailScheduler = EmailSchedulerService.getInstance();
export { EmailSchedulerService };
export type { ScheduledJob };