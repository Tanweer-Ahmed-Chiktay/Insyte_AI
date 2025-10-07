// Background job queue system for instant webhook processing
// Implements Redis-like queue with in-memory fallback for development

interface Job {
  id: string
  type: 'webhook-sync' | 'email-action' | 'background-sync'
  data: any
  priority: number
  attempts: number
  maxAttempts: number
  createdAt: Date
  scheduledAt?: Date
  processedAt?: Date
  error?: string
}

interface JobProcessor {
  (job: Job): Promise<void>
}

class JobQueue {
  private jobs = new Map<string, Job>()
  private processors = new Map<string, JobProcessor>()
  private isProcessing = false
  private processingInterval: NodeJS.Timeout | null = null
  private readonly PROCESSING_INTERVAL = 100 // Process every 100ms
  private readonly MAX_CONCURRENT_JOBS = 5
  private activeJobs = new Set<string>()

  constructor() {
    this.startProcessing()
  }

  /**
   * Add a job to the queue
   */
  async addJob(
    type: Job['type'],
    data: any,
    options: {
      priority?: number
      delay?: number
      maxAttempts?: number
    } = {}
  ): Promise<string> {
    const jobId = `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const now = new Date()
    
    const job: Job = {
      id: jobId,
      type,
      data,
      priority: options.priority || 0,
      attempts: 0,
      maxAttempts: options.maxAttempts || 3,
      createdAt: now,
      scheduledAt: options.delay ? new Date(now.getTime() + options.delay) : now
    }

    this.jobs.set(jobId, job)
    console.log(`[JobQueue] Added job ${jobId} of type ${type}`)
    return jobId
  }

  /**
   * Register a processor for a job type
   */
  registerProcessor(type: Job['type'], processor: JobProcessor) {
    this.processors.set(type, processor)
    console.log(`[JobQueue] Registered processor for ${type}`)
  }

  /**
   * Start processing jobs
   */
  private startProcessing() {
    if (this.isProcessing) return
    
    this.isProcessing = true
    // Job processing disabled - relying on Pub/Sub for real-time updates
    // Manual job processing can still be triggered when needed
    console.log('[JobQueue] Job processing disabled - using Pub/Sub for real-time updates')
    
    /*
    this.processingInterval = setInterval(() => {
      this.processNextJobs()
    }, this.PROCESSING_INTERVAL)
    
    console.log('[JobQueue] Started job processing')
    */
  }

  /**
   * Process next available jobs
   */
  private async processNextJobs() {
    if (this.activeJobs.size >= this.MAX_CONCURRENT_JOBS) {
      return // Too many concurrent jobs
    }

    // Get ready jobs sorted by priority and creation time
    const readyJobs = Array.from(this.jobs.values())
      .filter(job => 
        !this.activeJobs.has(job.id) &&
        job.attempts < job.maxAttempts &&
        (!job.scheduledAt || job.scheduledAt <= new Date())
      )
      .sort((a, b) => {
        // Higher priority first, then older jobs first
        if (a.priority !== b.priority) {
          return b.priority - a.priority
        }
        return a.createdAt.getTime() - b.createdAt.getTime()
      })

    const jobsToProcess = readyJobs.slice(0, this.MAX_CONCURRENT_JOBS - this.activeJobs.size)
    
    for (const job of jobsToProcess) {
      this.processJob(job)
    }
  }

  /**
   * Process a single job
   */
  private async processJob(job: Job) {
    this.activeJobs.add(job.id)
    job.attempts++
    job.processedAt = new Date()
    
    console.log(`[JobQueue] Processing job ${job.id} (attempt ${job.attempts}/${job.maxAttempts})`)
    
    try {
      const processor = this.processors.get(job.type)
      if (!processor) {
        throw new Error(`No processor registered for job type: ${job.type}`)
      }
      
      await processor(job)
      
      // Job completed successfully
      this.jobs.delete(job.id)
      console.log(`[JobQueue] Job ${job.id} completed successfully`)
      
    } catch (error) {
      console.error(`[JobQueue] Job ${job.id} failed:`, error)
      job.error = error instanceof Error ? error.message : String(error)
      
      if (job.attempts >= job.maxAttempts) {
        console.error(`[JobQueue] Job ${job.id} failed permanently after ${job.attempts} attempts`)
        this.jobs.delete(job.id)
        
        // Emit failure event
        this.emitJobEvent('job-failed', job)
      } else {
        // Schedule retry with exponential backoff
        const delay = Math.min(1000 * Math.pow(2, job.attempts - 1), 30000) // Max 30 seconds
        job.scheduledAt = new Date(Date.now() + delay)
        console.log(`[JobQueue] Job ${job.id} scheduled for retry in ${delay}ms`)
      }
    } finally {
      this.activeJobs.delete(job.id)
    }
  }

  /**
   * Emit job events for monitoring
   */
  private emitJobEvent(event: string, job: Job) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(`job-queue-${event}`, {
        detail: { job }
      }))
    }
  }

  /**
   * Get queue statistics
   */
  getStats() {
    const jobs = Array.from(this.jobs.values())
    return {
      total: jobs.length,
      active: this.activeJobs.size,
      pending: jobs.filter(j => j.attempts === 0).length,
      retrying: jobs.filter(j => j.attempts > 0).length,
      byType: jobs.reduce((acc, job) => {
        acc[job.type] = (acc[job.type] || 0) + 1
        return acc
      }, {} as Record<string, number>)
    }
  }

  /**
   * Stop processing jobs
   */
  stop() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval)
      this.processingInterval = null
    }
    this.isProcessing = false
    console.log('[JobQueue] Stopped job processing')
  }

  /**
   * Clear all jobs
   */
  clear() {
    this.jobs.clear()
    this.activeJobs.clear()
    console.log('[JobQueue] Cleared all jobs')
  }
}

// Global job queue instance
let globalJobQueue: JobQueue | null = null

export function getJobQueue(): JobQueue {
  if (!globalJobQueue) {
    globalJobQueue = new JobQueue()
  }
  return globalJobQueue
}

export { JobQueue, type Job, type JobProcessor }