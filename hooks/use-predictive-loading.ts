// Predictive Loading Hook - Prefetch content based on user behavior
// Analyzes patterns and preloads likely-to-be-accessed emails for instant loading

import { useState, useEffect, useCallback, useRef } from 'react'
import { getEmailCache, getCachedContent, cacheContent } from '../lib/indexed-db-cache'

export interface UserBehaviorPattern {
  emailId: string
  category: string
  accessTime: number
  scrollPosition: number
  timeSpent: number
  wasOpened: boolean
  fromSender: string
  subject: string
}

export interface PredictionScore {
  emailId: string
  score: number
  reasons: string[]
  confidence: number
}

export interface PredictiveLoadingOptions {
  maxPrefetchCount?: number
  minConfidenceThreshold?: number
  prefetchDelay?: number
  trackingEnabled?: boolean
  cacheStrategy?: 'aggressive' | 'conservative' | 'smart'
}

/**
 * Hook for predictive loading of email content based on user behavior
 */
export function usePredictiveLoading(options: PredictiveLoadingOptions = {}) {
  const {
    maxPrefetchCount = 5,
    minConfidenceThreshold = 0.6,
    prefetchDelay = 100,
    trackingEnabled = true,
    cacheStrategy = 'smart'
  } = options

  const [behaviorPatterns, setBehaviorPatterns] = useState<UserBehaviorPattern[]>([])
  const [predictions, setPredictions] = useState<PredictionScore[]>([])
  const [prefetchQueue, setPrefetchQueue] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [stats, setStats] = useState({
    totalPrefetched: 0,
    cacheHits: 0,
    cacheMisses: 0,
    accuracy: 0
  })

  const prefetchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const behaviorStorageKey = 'gmail-user-behavior-patterns'
  const maxPatterns = 1000 // Limit stored patterns

  /**
   * Load behavior patterns from localStorage
   */
  useEffect(() => {
    if (!trackingEnabled) return

    try {
      const stored = localStorage.getItem(behaviorStorageKey)
      if (stored) {
        const patterns = JSON.parse(stored)
        setBehaviorPatterns(patterns.slice(-maxPatterns)) // Keep only recent patterns
      }
    } catch (error) {
      console.error('Failed to load behavior patterns:', error)
    }
  }, [trackingEnabled])

  /**
   * Save behavior patterns to localStorage
   */
  const saveBehaviorPatterns = useCallback((patterns: UserBehaviorPattern[]) => {
    if (!trackingEnabled) return

    try {
      localStorage.setItem(behaviorStorageKey, JSON.stringify(patterns.slice(-maxPatterns)))
    } catch (error) {
      console.error('Failed to save behavior patterns:', error)
    }
  }, [trackingEnabled])

  /**
   * Track user interaction with an email
   */
  const trackEmailInteraction = useCallback(
    (emailData: {
      emailId: string
      category: string
      scrollPosition?: number
      timeSpent?: number
      wasOpened?: boolean
      fromSender?: string
      subject?: string
    }) => {
      if (!trackingEnabled) return

      const pattern: UserBehaviorPattern = {
        emailId: emailData.emailId,
        category: emailData.category,
        accessTime: Date.now(),
        scrollPosition: emailData.scrollPosition || 0,
        timeSpent: emailData.timeSpent || 0,
        wasOpened: emailData.wasOpened || false,
        fromSender: emailData.fromSender || '',
        subject: emailData.subject || ''
      }

      setBehaviorPatterns(prev => {
        const newPatterns = [...prev, pattern].slice(-maxPatterns)
        saveBehaviorPatterns(newPatterns)
        return newPatterns
      })
    },
    [trackingEnabled, saveBehaviorPatterns]
  )

  /**
   * Calculate prediction scores for emails
   */
  const calculatePredictions = useCallback(
    (emails: any[]): PredictionScore[] => {
      if (!trackingEnabled || behaviorPatterns.length < 10) {
        return []
      }

      return emails.map(email => {
        const reasons: string[] = []
        let score = 0

        // Sender frequency analysis
        const senderPatterns = behaviorPatterns.filter(p => 
          p.fromSender === email.from && p.wasOpened
        )
        if (senderPatterns.length > 0) {
          const senderOpenRate = senderPatterns.length / 
            behaviorPatterns.filter(p => p.fromSender === email.from).length
          score += senderOpenRate * 0.3
          reasons.push(`Sender open rate: ${(senderOpenRate * 100).toFixed(1)}%`)
        }

        // Category preferences
        const categoryPatterns = behaviorPatterns.filter(p => 
          p.category === email.category && p.wasOpened
        )
        if (categoryPatterns.length > 0) {
          const categoryOpenRate = categoryPatterns.length / 
            behaviorPatterns.filter(p => p.category === email.category).length
          score += categoryOpenRate * 0.2
          reasons.push(`Category preference: ${(categoryOpenRate * 100).toFixed(1)}%`)
        }

        // Time-based patterns
        const currentHour = new Date().getHours()
        const hourPatterns = behaviorPatterns.filter(p => {
          const patternHour = new Date(p.accessTime).getHours()
          return Math.abs(patternHour - currentHour) <= 1 && p.wasOpened
        })
        if (hourPatterns.length > 0) {
          score += 0.15
          reasons.push('Active time period')
        }

        // Subject keywords analysis
        const subjectWords = email.subject.toLowerCase().split(/\s+/)
        const keywordMatches = behaviorPatterns.filter(p => {
          if (!p.wasOpened || !p.subject) return false
          const patternWords = p.subject.toLowerCase().split(/\s+/)
          return subjectWords.some((word: string) => 
            word.length > 3 && patternWords.includes(word)
          )
        })
        if (keywordMatches.length > 0) {
          score += Math.min(keywordMatches.length / 10, 0.2)
          reasons.push('Subject keyword match')
        }

        // Recency boost for unread emails
        if (!email.isRead) {
          const emailAge = Date.now() - new Date(email.date).getTime()
          const hoursSinceReceived = emailAge / (1000 * 60 * 60)
          if (hoursSinceReceived < 1) {
            score += 0.1
            reasons.push('Recently received')
          }
        }

        // Position in list (emails at top are more likely to be opened)
        const position = emails.findIndex(e => e.id === email.id)
        if (position < 5) {
          score += (5 - position) * 0.02
          reasons.push('High position in list')
        }

        // Attachment preference
        if (email.hasAttachment) {
          const attachmentPatterns = behaviorPatterns.filter(p => 
            p.wasOpened && behaviorPatterns.some(bp => 
              bp.emailId === p.emailId && bp.timeSpent > 30000 // 30+ seconds
            )
          )
          if (attachmentPatterns.length > 0) {
            score += 0.1
            reasons.push('Has attachment (user preference)')
          }
        }

        // Calculate confidence based on pattern count and consistency
        const relevantPatterns = behaviorPatterns.filter(p => 
          p.fromSender === email.from || p.category === email.category
        )
        const confidence = Math.min(relevantPatterns.length / 20, 1)

        return {
          emailId: email.id,
          score: Math.min(score, 1),
          reasons,
          confidence
        }
      })
        .filter(prediction => 
          prediction.score >= minConfidenceThreshold && 
          prediction.confidence >= 0.3
        )
        .sort((a, b) => b.score - a.score)
        .slice(0, maxPrefetchCount)
    },
    [behaviorPatterns, trackingEnabled, minConfidenceThreshold, maxPrefetchCount]
  )

  /**
   * Prefetch email content
   */
  const prefetchEmailContent = useCallback(
    async (emailId: string): Promise<boolean> => {
      try {
        // Check if already cached
        const cached = await getCachedContent(emailId)
        if (cached) {
          setStats(prev => ({ ...prev, cacheHits: prev.cacheHits + 1 }))
          return true
        }

        // Fetch from API
        const response = await fetch(`/api/gmail/message/${emailId}`)
        if (!response.ok) {
          throw new Error(`Failed to fetch email: ${response.statusText}`)
        }

        const content = await response.json()
        
        // Cache the content
        await cacheContent(emailId, content, response.headers.get('etag') || undefined)
        
        setStats(prev => ({ 
          ...prev, 
          totalPrefetched: prev.totalPrefetched + 1,
          cacheMisses: prev.cacheMisses + 1
        }))
        
        return true
      } catch (error) {
        console.error(`Failed to prefetch email ${emailId}:`, error)
        return false
      }
    },
    []
  )

  /**
   * Process prefetch queue
   */
  const processPrefetchQueue = useCallback(
    async (queue: string[]) => {
      if (queue.length === 0 || isLoading) return

      setIsLoading(true)
      
      try {
        // Process emails in batches to avoid overwhelming the API
        const batchSize = cacheStrategy === 'aggressive' ? 3 : 
                         cacheStrategy === 'conservative' ? 1 : 2
        
        for (let i = 0; i < queue.length; i += batchSize) {
          const batch = queue.slice(i, i + batchSize)
          
          await Promise.all(
            batch.map(emailId => prefetchEmailContent(emailId))
          )
          
          // Add delay between batches to be respectful to the API
          if (i + batchSize < queue.length) {
            await new Promise(resolve => setTimeout(resolve, prefetchDelay))
          }
        }
      } finally {
        setIsLoading(false)
      }
    },
    [isLoading, cacheStrategy, prefetchDelay, prefetchEmailContent]
  )

  /**
   * Start predictive loading for a list of emails
   */
  const startPredictiveLoading = useCallback(
    (emails: any[]) => {
      if (!trackingEnabled) return

      const newPredictions = calculatePredictions(emails)
      setPredictions(newPredictions)
      
      const emailsToPreload = newPredictions.map(p => p.emailId)
      setPrefetchQueue(emailsToPreload)
      
      // Clear existing timeout
      if (prefetchTimeoutRef.current) {
        clearTimeout(prefetchTimeoutRef.current)
      }
      
      // Start prefetching after a short delay
      prefetchTimeoutRef.current = setTimeout(() => {
        processPrefetchQueue(emailsToPreload)
      }, prefetchDelay)
    },
    [trackingEnabled, calculatePredictions, prefetchDelay, processPrefetchQueue]
  )

  /**
   * Check if an email is likely to be opened soon
   */
  const isPredictedToOpen = useCallback(
    (emailId: string): boolean => {
      return predictions.some(p => p.emailId === emailId)
    },
    [predictions]
  )

  /**
   * Get prediction details for an email
   */
  const getPredictionDetails = useCallback(
    (emailId: string): PredictionScore | null => {
      return predictions.find(p => p.emailId === emailId) || null
    },
    [predictions]
  )

  /**
   * Update accuracy stats when user actually opens an email
   */
  const recordEmailOpen = useCallback(
    (emailId: string) => {
      const wasPredicted = predictions.some(p => p.emailId === emailId)
      
      setStats(prev => {
        const totalPredictions = prev.totalPrefetched
        const correctPredictions = wasPredicted ? prev.cacheHits + 1 : prev.cacheHits
        
        return {
          ...prev,
          cacheHits: wasPredicted ? prev.cacheHits + 1 : prev.cacheHits,
          accuracy: totalPredictions > 0 ? correctPredictions / totalPredictions : 0
        }
      })
    },
    [predictions]
  )

  /**
   * Clear behavior patterns (for privacy)
   */
  const clearBehaviorData = useCallback(() => {
    setBehaviorPatterns([])
    setPredictions([])
    setPrefetchQueue([])
    localStorage.removeItem(behaviorStorageKey)
    setStats({
      totalPrefetched: 0,
      cacheHits: 0,
      cacheMisses: 0,
      accuracy: 0
    })
  }, [])

  /**
   * Get learning insights for debugging/analytics
   */
  const getLearningInsights = useCallback(() => {
    if (behaviorPatterns.length === 0) return null

    const senderStats = behaviorPatterns.reduce((acc, pattern) => {
      if (!acc[pattern.fromSender]) {
        acc[pattern.fromSender] = { total: 0, opened: 0 }
      }
      acc[pattern.fromSender].total++
      if (pattern.wasOpened) {
        acc[pattern.fromSender].opened++
      }
      return acc
    }, {} as Record<string, { total: number; opened: number }>)

    const categoryStats = behaviorPatterns.reduce((acc, pattern) => {
      if (!acc[pattern.category]) {
        acc[pattern.category] = { total: 0, opened: 0 }
      }
      acc[pattern.category].total++
      if (pattern.wasOpened) {
        acc[pattern.category].opened++
      }
      return acc
    }, {} as Record<string, { total: number; opened: number }>)

    return {
      totalPatterns: behaviorPatterns.length,
      senderStats,
      categoryStats,
      averageTimeSpent: behaviorPatterns
        .filter(p => p.timeSpent > 0)
        .reduce((sum, p) => sum + p.timeSpent, 0) / 
        behaviorPatterns.filter(p => p.timeSpent > 0).length || 0,
      openRate: behaviorPatterns.filter(p => p.wasOpened).length / behaviorPatterns.length
    }
  }, [behaviorPatterns])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (prefetchTimeoutRef.current) {
        clearTimeout(prefetchTimeoutRef.current)
      }
    }
  }, [])

  return {
    predictions,
    prefetchQueue,
    isLoading,
    stats,
    trackEmailInteraction,
    startPredictiveLoading,
    isPredictedToOpen,
    getPredictionDetails,
    recordEmailOpen,
    clearBehaviorData,
    getLearningInsights
  }
}

/**
 * Hook for tracking email list interactions
 */
export function useEmailListTracking() {
  const scrollPositionRef = useRef(0)
  const viewStartTimeRef = useRef<Record<string, number>>({})
  const { trackEmailInteraction } = usePredictiveLoading()

  const trackEmailView = useCallback(
    (emailId: string, category: string, fromSender: string, subject: string) => {
      viewStartTimeRef.current[emailId] = Date.now()
      
      trackEmailInteraction({
        emailId,
        category,
        fromSender,
        subject,
        scrollPosition: scrollPositionRef.current
      })
    },
    [trackEmailInteraction]
  )

  const trackEmailOpen = useCallback(
    (emailId: string, category: string, fromSender: string, subject: string) => {
      const viewStartTime = viewStartTimeRef.current[emailId]
      const timeSpent = viewStartTime ? Date.now() - viewStartTime : 0
      
      trackEmailInteraction({
        emailId,
        category,
        fromSender,
        subject,
        timeSpent,
        wasOpened: true,
        scrollPosition: scrollPositionRef.current
      })
      
      delete viewStartTimeRef.current[emailId]
    },
    [trackEmailInteraction]
  )

  const updateScrollPosition = useCallback((position: number) => {
    scrollPositionRef.current = position
  }, [])

  return {
    trackEmailView,
    trackEmailOpen,
    updateScrollPosition
  }
}