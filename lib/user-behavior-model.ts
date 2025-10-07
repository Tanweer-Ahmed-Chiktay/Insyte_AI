/**
 * User Behavior Model for AI-like Prediction
 * Tracks and analyzes user patterns to predict future actions
 * Based on improve2.txt specifications for smart preloading
 */

import { Email } from './email-store'

interface UserAction {
  type: 'click' | 'hover' | 'scroll' | 'search' | 'category-switch' | 'email-open' | 'email-archive' | 'email-delete'
  emailId?: string
  category?: string
  sender?: string
  threadId?: string
  timestamp: number
  context?: Record<string, any>
}

interface BehaviorPattern {
  id: string
  type: 'time-of-day' | 'sender-frequency' | 'category-preference' | 'thread-engagement' | 'scroll-speed'
  pattern: Record<string, number>
  confidence: number
  lastUpdated: number
  sampleSize: number
}

interface TimePattern {
  hour: number
  dayOfWeek: number
  activity: number
  emailTypes: string[]
}

interface SenderStats {
  sender: string
  totalEmails: number
  openRate: number
  responseRate: number
  averageOpenTime: number
  lastInteraction: number
  categories: string[]
}

interface CategoryStats {
  category: string
  totalEmails: number
  openRate: number
  timeSpent: number
  switchFrequency: number
  peakHours: number[]
}

interface ThreadStats {
  threadId: string
  totalMessages: number
  userMessages: number
  lastActivity: number
  averageResponseTime: number
  engagement: number
}

export class UserBehaviorModel {
  private static instance: UserBehaviorModel
  private actions: UserAction[] = []
  private patterns = new Map<string, BehaviorPattern>()
  private senderStats = new Map<string, SenderStats>()
  private categoryStats = new Map<string, CategoryStats>()
  private threadStats = new Map<string, ThreadStats>()
  private timePatterns: TimePattern[] = []
  
  // Configuration
  private maxActionsHistory = 10000
  private patternUpdateInterval = 5 * 60 * 1000 // 5 minutes
  private minSampleSize = 10
  
  private constructor() {
    this.initialize()
  }
  
  static getInstance(): UserBehaviorModel {
    if (!UserBehaviorModel.instance) {
      UserBehaviorModel.instance = new UserBehaviorModel()
    }
    return UserBehaviorModel.instance
  }
  
  private async initialize(): Promise<void> {
    // Load existing patterns from storage
    await this.loadPatternsFromStorage()
    
    // Periodic pattern analysis and cleanup disabled - relying on Pub/Sub for real-time updates
    // Manual pattern analysis and cleanup can still be triggered when needed
    console.log('[UserBehaviorModel] Periodic tasks disabled - using Pub/Sub for real-time updates')
    
    console.log('[UserBehaviorModel] Initialized with', this.actions.length, 'historical actions')
  }
  
  private async loadPatternsFromStorage(): Promise<void> {
    try {
      // Load from localStorage or IndexedDB
      const stored = localStorage.getItem('user-behavior-patterns')
      if (stored) {
        const data = JSON.parse(stored)
        
        // Restore patterns
        if (data.patterns) {
          this.patterns = new Map(data.patterns)
        }
        
        // Restore stats
        if (data.senderStats) {
          this.senderStats = new Map(data.senderStats)
        }
        
        if (data.categoryStats) {
          this.categoryStats = new Map(data.categoryStats)
        }
        
        if (data.threadStats) {
          this.threadStats = new Map(data.threadStats)
        }
        
        if (data.timePatterns) {
          this.timePatterns = data.timePatterns
        }
        
        // Load recent actions
        if (data.recentActions) {
          this.actions = data.recentActions.slice(-1000) // Keep last 1000 actions
        }
      }
    } catch (error) {
      console.warn('[UserBehaviorModel] Failed to load patterns from storage:', error)
    }
  }
  
  private async savePatternsToStorage(): Promise<void> {
    try {
      const data = {
        patterns: Array.from(this.patterns.entries()),
        senderStats: Array.from(this.senderStats.entries()),
        categoryStats: Array.from(this.categoryStats.entries()),
        threadStats: Array.from(this.threadStats.entries()),
        timePatterns: this.timePatterns,
        recentActions: this.actions.slice(-1000), // Save last 1000 actions
        lastSaved: Date.now()
      }
      
      localStorage.setItem('user-behavior-patterns', JSON.stringify(data))
    } catch (error) {
      console.warn('[UserBehaviorModel] Failed to save patterns to storage:', error)
    }
  }
  
  public trackAction(action: UserAction): void {
    // Add timestamp if not provided
    if (!action.timestamp) {
      action.timestamp = Date.now()
    }
    
    // Add to actions history
    this.actions.push(action)
    
    // Maintain max history size
    if (this.actions.length > this.maxActionsHistory) {
      this.actions = this.actions.slice(-this.maxActionsHistory)
    }
    
    // Update real-time stats
    this.updateRealtimeStats(action)
    
    // Save periodically
    if (this.actions.length % 50 === 0) {
      this.savePatternsToStorage()
    }
  }
  
  private updateRealtimeStats(action: UserAction): void {
    const now = Date.now()
    
    // Update sender stats
    if (action.sender) {
      let stats = this.senderStats.get(action.sender)
      if (!stats) {
        stats = {
          sender: action.sender,
          totalEmails: 0,
          openRate: 0,
          responseRate: 0,
          averageOpenTime: 0,
          lastInteraction: now,
          categories: []
        }
        this.senderStats.set(action.sender, stats)
      }
      
      stats.lastInteraction = now
      if (action.type === 'email-open') {
        stats.totalEmails++
      }
    }
    
    // Update category stats
    if (action.category) {
      let stats = this.categoryStats.get(action.category)
      if (!stats) {
        stats = {
          category: action.category,
          totalEmails: 0,
          openRate: 0,
          timeSpent: 0,
          switchFrequency: 0,
          peakHours: []
        }
        this.categoryStats.set(action.category, stats)
      }
      
      if (action.type === 'category-switch') {
        stats.switchFrequency++
      }
    }
    
    // Update thread stats
    if (action.threadId) {
      let stats = this.threadStats.get(action.threadId)
      if (!stats) {
        stats = {
          threadId: action.threadId,
          totalMessages: 0,
          userMessages: 0,
          lastActivity: now,
          averageResponseTime: 0,
          engagement: 0
        }
        this.threadStats.set(action.threadId, stats)
      }
      
      stats.lastActivity = now
      if (action.type === 'email-open') {
        stats.engagement++
      }
    }
  }
  
  private analyzePatterns(): void {
    console.log('[UserBehaviorModel] Analyzing patterns from', this.actions.length, 'actions')
    
    // Analyze time patterns
    this.analyzeTimePatterns()
    
    // Analyze sender patterns
    this.analyzeSenderPatterns()
    
    // Analyze category patterns
    this.analyzeCategoryPatterns()
    
    // Analyze thread patterns
    this.analyzeThreadPatterns()
    
    // Save updated patterns
    this.savePatternsToStorage()
  }
  
  private analyzeTimePatterns(): void {
    const timeActions = this.actions.filter(a => a.type === 'email-open')
    if (timeActions.length < this.minSampleSize) return
    
    // Group by hour and day of week
    const hourlyActivity = new Array(24).fill(0)
    const dailyActivity = new Array(7).fill(0)
    
    timeActions.forEach(action => {
      const date = new Date(action.timestamp)
      const hour = date.getHours()
      const dayOfWeek = date.getDay()
      
      hourlyActivity[hour]++
      dailyActivity[dayOfWeek]++
    })
    
    // Find peak hours
    const maxHourlyActivity = Math.max(...hourlyActivity)
    const peakHours = hourlyActivity
      .map((activity, hour) => ({ hour, activity }))
      .filter(({ activity }) => activity > maxHourlyActivity * 0.7)
      .map(({ hour }) => hour)
    
    // Update time patterns
    this.timePatterns = peakHours.map(hour => ({
      hour,
      dayOfWeek: -1, // All days
      activity: hourlyActivity[hour] / timeActions.length,
      emailTypes: ['all']
    }))
    
    // Store as pattern
    this.patterns.set('time-of-day', {
      id: 'time-of-day',
      type: 'time-of-day',
      pattern: Object.fromEntries(hourlyActivity.map((activity, hour) => [hour.toString(), activity])),
      confidence: Math.min(1, timeActions.length / 100),
      lastUpdated: Date.now(),
      sampleSize: timeActions.length
    })
  }
  
  private analyzeSenderPatterns(): void {
    const senderActions = this.actions.filter(a => a.sender && a.type === 'email-open')
    
    // Group by sender
    const senderCounts = new Map<string, number>()
    senderActions.forEach(action => {
      const count = senderCounts.get(action.sender!) || 0
      senderCounts.set(action.sender!, count + 1)
    })
    
    // Calculate frequencies
    const totalActions = senderActions.length
    const senderFrequencies: Record<string, number> = {}
    
    senderCounts.forEach((count, sender) => {
      const frequency = count / totalActions
      senderFrequencies[sender] = frequency
      
      // Update sender stats
      const stats = this.senderStats.get(sender)
      if (stats) {
        stats.openRate = frequency
      }
    })
    
    this.patterns.set('sender-frequency', {
      id: 'sender-frequency',
      type: 'sender-frequency',
      pattern: senderFrequencies,
      confidence: Math.min(1, totalActions / 50),
      lastUpdated: Date.now(),
      sampleSize: totalActions
    })
  }
  
  private analyzeCategoryPatterns(): void {
    const categoryActions = this.actions.filter(a => a.category)
    
    // Group by category
    const categoryCounts = new Map<string, number>()
    categoryActions.forEach(action => {
      const count = categoryCounts.get(action.category!) || 0
      categoryCounts.set(action.category!, count + 1)
    })
    
    // Calculate preferences
    const totalActions = categoryActions.length
    const categoryPreferences: Record<string, number> = {}
    
    categoryCounts.forEach((count, category) => {
      categoryPreferences[category] = count / totalActions
    })
    
    this.patterns.set('category-preference', {
      id: 'category-preference',
      type: 'category-preference',
      pattern: categoryPreferences,
      confidence: Math.min(1, totalActions / 30),
      lastUpdated: Date.now(),
      sampleSize: totalActions
    })
  }
  
  private analyzeThreadPatterns(): void {
    const threadActions = this.actions.filter(a => a.threadId)
    
    // Group by thread
    const threadEngagement = new Map<string, number>()
    threadActions.forEach(action => {
      const engagement = threadEngagement.get(action.threadId!) || 0
      threadEngagement.set(action.threadId!, engagement + 1)
    })
    
    // Calculate engagement scores
    const engagementValues = Array.from(threadEngagement.values())
    const maxEngagement = engagementValues.length > 0 ? Math.max(...engagementValues) : 1
    const threadScores: Record<string, number> = {}
    
    threadEngagement.forEach((engagement, threadId) => {
      threadScores[threadId] = engagement / maxEngagement
    })
    
    this.patterns.set('thread-engagement', {
      id: 'thread-engagement',
      type: 'thread-engagement',
      pattern: threadScores,
      confidence: Math.min(1, threadActions.length / 20),
      lastUpdated: Date.now(),
      sampleSize: threadActions.length
    })
  }
  
  private cleanupOldActions(): void {
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    const initialLength = this.actions.length
    
    this.actions = this.actions.filter(action => action.timestamp > oneWeekAgo)
    
    if (this.actions.length < initialLength) {
      console.log('[UserBehaviorModel] Cleaned up', initialLength - this.actions.length, 'old actions')
      this.savePatternsToStorage()
    }
  }
  
  // Public API for predictions
  public async getSenderFrequency(sender: string): Promise<number> {
    const pattern = this.patterns.get('sender-frequency')
    if (!pattern || pattern.confidence < 0.3) return 0.1 // Default low frequency
    
    return pattern.pattern[sender] || 0.1
  }
  
  public async getTimePatternScore(): Promise<number> {
    const now = new Date()
    const currentHour = now.getHours()
    
    const pattern = this.patterns.get('time-of-day')
    if (!pattern || pattern.confidence < 0.3) return 0.5 // Default medium score
    
    const hourScore = pattern.pattern[currentHour.toString()] || 0
    const maxScore = Math.max(...Object.values(pattern.pattern))
    
    return maxScore > 0 ? hourScore / maxScore : 0.5
  }
  
  public async getThreadActivity(threadId: string): Promise<number> {
    const pattern = this.patterns.get('thread-engagement')
    if (!pattern || pattern.confidence < 0.3) return 0.3 // Default low activity
    
    return pattern.pattern[threadId] || 0.3
  }
  
  public async getCategorySwitchProbability(category: string): Promise<number> {
    const pattern = this.patterns.get('category-preference')
    if (!pattern || pattern.confidence < 0.3) return 0.2 // Default low probability
    
    const preference = pattern.pattern[category] || 0.1
    
    // Recent category switches increase probability
    const recentSwitches = this.actions
      .filter(a => a.type === 'category-switch' && a.timestamp > Date.now() - 60 * 60 * 1000) // Last hour
      .length
    
    const switchBonus = Math.min(0.3, recentSwitches * 0.1)
    
    return Math.min(1, preference + switchBonus)
  }
  
  public getRecentActions(limit = 100): UserAction[] {
    return this.actions.slice(-limit)
  }
  
  public getPatterns(): Map<string, BehaviorPattern> {
    return new Map(this.patterns)
  }
  
  public getSenderStats(): Map<string, SenderStats> {
    return new Map(this.senderStats)
  }
  
  public getCategoryStats(): Map<string, CategoryStats> {
    return new Map(this.categoryStats)
  }
  
  public getThreadStats(): Map<string, ThreadStats> {
    return new Map(this.threadStats)
  }
  
  // Reset methods for testing
  public reset(): void {
    this.actions = []
    this.patterns.clear()
    this.senderStats.clear()
    this.categoryStats.clear()
    this.threadStats.clear()
    this.timePatterns = []
    localStorage.removeItem('user-behavior-patterns')
  }
  
  public getStats(): {
    totalActions: number
    patterns: number
    confidence: number
    oldestAction: number
    newestAction: number
  } {
    const actions = this.actions
    const avgConfidence = Array.from(this.patterns.values())
      .reduce((sum, p) => sum + p.confidence, 0) / this.patterns.size || 0
    
    return {
      totalActions: actions.length,
      patterns: this.patterns.size,
      confidence: avgConfidence,
      oldestAction: actions.length > 0 ? actions[0].timestamp : 0,
      newestAction: actions.length > 0 ? actions[actions.length - 1].timestamp : 0
    }
  }
}

export default UserBehaviorModel