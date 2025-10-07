import useSWR from 'swr'
import { useCallback, useEffect, useMemo } from 'react'
import useEmailStore, { Email, CacheInfo } from '@/lib/email-store'
import { useToast } from '@/components/ui/use-toast'

interface EmailResponse {
  emails: Email[]
  cacheInfo: CacheInfo
  hasMore?: boolean
  nextOlderThan?: string
  pagination?: {
    hasMore: boolean
    nextOlderThan?: string
    currentPeriod: string
  }
}

const fetcher = async (url: string): Promise<EmailResponse> => {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('Failed to fetch emails')
  }
  return response.json()
}

interface UseEmailCacheOptions {
  category?: string
  forceRefresh?: boolean
  revalidateOnFocus?: boolean
  maxAgeMinutes?: number
  enablePrefetch?: boolean
  olderThan?: string
  refreshOnly?: boolean
}

export function useEmailCache({
  category = 'inbox',
  forceRefresh = false,
  revalidateOnFocus = false,
  maxAgeMinutes = 5,
  enablePrefetch = true,
  olderThan,
  refreshOnly = false
}: UseEmailCacheOptions = {}) {
  const { toast } = useToast()
  const {
    getEmails,
    getCacheInfo,
    isLoading: isStoreLoading,
    setEmails,
    clearCategory,
    setLoading,
    isCacheValid
  } = useEmailStore()

  // Check if we should use cached data
  const shouldUseCachedData = !forceRefresh && isCacheValid(category, maxAgeMinutes)
  
  // Build API URL with parameters
  const buildUrl = useCallback((cat: string, force: boolean = false, older?: string, refresh?: boolean) => {
    const params = new URLSearchParams({
      category: cat,
      ...(force && { forceRefresh: 'true' }),
      ...(older && { olderThan: older }),
      ...(refresh && { refreshOnly: 'true' })
    })
    return `/api/emails?${params.toString()}`
  }, [])

  // SWR configuration
  const swrKey = shouldUseCachedData ? null : buildUrl(category, forceRefresh, olderThan, refreshOnly)
  
  // Memoize SWR callbacks to prevent infinite re-renders
  const onSuccess = useCallback((data: EmailResponse) => {
    // Store in Zustand store with pagination metadata
    const hasMore = data.pagination?.hasMore ?? data.hasMore ?? false
    const nextOlderThan = data.pagination?.nextOlderThan ?? data.nextOlderThan
    setEmails(category, data.emails, data.cacheInfo, hasMore, nextOlderThan)
    
    // Log cache status instead of showing toast to prevent infinite loops
    console.log(`[useEmailCache] Emails loaded for ${category}:`, {
      source: data.cacheInfo.source,
      cached: data.cacheInfo.cached,
      newlyFetched: data.cacheInfo.newlyFetched
    })
  }, [category, setEmails])
  
  const onError = useCallback((error: any) => {
    console.error(`Failed to fetch emails for ${category}:`, error)
    // Log error instead of showing toast to prevent infinite loops
  }, [category])
  
  // Memoize SWR configuration to prevent re-initialization
  const swrConfig = useMemo(() => ({
    revalidateOnFocus: false, // Disable focus revalidation to reduce requests
    revalidateOnReconnect: true,
    dedupingInterval: 60000, // 60 seconds - increased from 30s
    errorRetryCount: 2, // Reduced from 3 to 2
    errorRetryInterval: 10000, // Increased from 5s to 10s
    onSuccess,
    onError
  }), [onSuccess, onError])
  
  const {
    data,
    error,
    isLoading: swrLoading,
    mutate,
    isValidating
  } = useSWR<EmailResponse>(swrKey, fetcher, swrConfig)

  // Get emails from store (either cached or freshly fetched)
  // Always prioritize store data to ensure real-time updates are reflected
  const storeEmails = getEmails(category)
  const emails = storeEmails.length > 0 ? storeEmails : (data?.emails || [])
  const cacheInfo = getCacheInfo(category) || data?.cacheInfo
  const isLoading = swrLoading || isStoreLoading(category)

  // Prefetch other categories in background
  useEffect(() => {
    if (enablePrefetch && emails.length > 0) {
      const categoriesToPrefetch = ['sent', 'starred', 'important'].filter(cat => cat !== category)
      
      categoriesToPrefetch.forEach(cat => {
        if (!isCacheValid(cat, maxAgeMinutes)) {
          // Prefetch with a small delay to avoid overwhelming the API
          setTimeout(() => {
            fetch(buildUrl(cat))
              .then(res => res.json())
              .then((data: EmailResponse) => {
                const hasMore = data.pagination?.hasMore ?? data.hasMore ?? false
                const nextOlderThan = data.pagination?.nextOlderThan ?? data.nextOlderThan
                setEmails(cat, data.emails, data.cacheInfo, hasMore, nextOlderThan)
              })
              .catch(err => console.log(`Prefetch failed for ${cat}:`, err))
          }, 1000 + Math.random() * 2000) // Random delay between 1-3 seconds
        }
      })
    }
  }, [emails.length, category, enablePrefetch, buildUrl, setEmails, isCacheValid, maxAgeMinutes])

  // Cache invalidation function
  const invalidateCache = useCallback(() => {
    console.log(`[useEmailCache] Invalidating cache for ${category}`)
    // Clear SWR cache
    mutate(undefined, { revalidate: false })
    // Clear store cache
    clearCategory(category)
  }, [mutate, category, clearCategory])

  // Refresh function with improved error handling
  const refresh = useCallback(async (force: boolean = false) => {
    console.log(`[useEmailCache] Refresh called for ${category}, force: ${force}`)
    setLoading(category, true)
    try {
      if (force) {
        // Force refresh by fetching new data without refreshOnly flag for better UI updates
        console.log(`[useEmailCache] Force refreshing ${category} emails`)
        const freshData = await fetcher(buildUrl(category, true, undefined, false))
        const hasMore = freshData.pagination?.hasMore ?? freshData.hasMore ?? false
        const nextOlderThan = freshData.pagination?.nextOlderThan ?? freshData.nextOlderThan
        
        // Update store first for immediate UI update
        setEmails(category, freshData.emails, freshData.cacheInfo, hasMore, nextOlderThan)
        console.log(`[useEmailCache] Updated ${category} with ${freshData.emails.length} emails`)
        
        // Then update SWR cache
        await mutate(freshData, {
          revalidate: false,
          populateCache: true
        })
      } else {
        // Regular refresh
        console.log(`[useEmailCache] Regular refresh for ${category}`)
        await mutate(undefined, {
          revalidate: true,
          populateCache: true
        })
      }
    } catch (error) {
      console.error(`[useEmailCache] Refresh failed for ${category}:`, error)
      
      // Enhanced error handling with user feedback
      if (error instanceof Error) {
        if (error.message.includes('401') || error.message.includes('unauthorized')) {
          toast({
            title: 'Authentication Error',
            description: 'Please sign in again to continue.',
            variant: 'destructive'
          })
        } else if (error.message.includes('network') || error.message.includes('fetch')) {
          toast({
            title: 'Network Error',
            description: 'Please check your internet connection and try again.',
            variant: 'destructive'
          })
        } else {
          toast({
            title: 'Refresh Failed',
            description: 'Unable to refresh emails. Please try again.',
            variant: 'destructive'
          })
        }
      }
      
      throw error
    } finally {
      setLoading(category, false)
    }
  }, [mutate, category, setLoading, buildUrl, setEmails, toast])

  // Load older emails function
  const loadOlderEmails = useCallback(async (olderThanDate: string) => {
    try {
      const olderData = await fetcher(buildUrl(category, false, olderThanDate))
      // Append older emails to existing ones
      const currentEmails = getEmails(category)
      const combinedEmails = [...currentEmails, ...olderData.emails]
      const hasMore = olderData.pagination?.hasMore ?? olderData.hasMore ?? false
      const nextOlderThan = olderData.pagination?.nextOlderThan ?? olderData.nextOlderThan
      setEmails(category, combinedEmails, olderData.cacheInfo, hasMore, nextOlderThan)
      return olderData
    } catch (error) {
      console.error('Failed to load older emails:', error)
      throw error
    }
  }, [buildUrl, category, getEmails, setEmails])

  // Background sync function
  const backgroundSync = useCallback(async () => {
    const categories = ['inbox', 'sent', 'starred', 'important']
    
    try {
      const promises = categories.map(async (cat) => {
        if (!isCacheValid(cat, maxAgeMinutes)) {
          const response = await fetch(buildUrl(cat))
          const data: EmailResponse = await response.json()
          const hasMore = data.pagination?.hasMore ?? data.hasMore ?? false
          const nextOlderThan = data.pagination?.nextOlderThan ?? data.nextOlderThan
          setEmails(cat, data.emails, data.cacheInfo, hasMore, nextOlderThan)
          return { category: cat, count: data.emails.length }
        }
        return { category: cat, count: 0 }
      })
      
      const results = await Promise.allSettled(promises)
      const successful = results
        .filter((result): result is PromiseFulfilledResult<{category: string, count: number}> => 
          result.status === 'fulfilled'
        )
        .map(result => result.value)
        .filter(result => result.count > 0)
      
      if (successful.length > 0) {
        toast({
          title: "Background sync completed",
          description: `Updated ${successful.length} email categories`,
          duration: 2000
        })
      }
    } catch (error) {
      console.error('Background sync failed:', error)
    }
  }, [buildUrl, setEmails, isCacheValid, maxAgeMinutes, toast])

  return {
    emails,
    cacheInfo,
    isLoading,
    isValidating,
    error,
    refresh,
    invalidateCache,
    backgroundSync,
    loadOlderEmails,
    hasMore: data?.pagination?.hasMore ?? data?.hasMore ?? cacheInfo?.hasMore ?? false,
    nextOlderThan: data?.pagination?.nextOlderThan ?? data?.nextOlderThan ?? cacheInfo?.nextOlderThan,
    mutate
  }
}

// Hook for prefetching specific categories
export function usePrefetchEmails() {
  const { setEmails, isCacheValid } = useEmailStore()
  
  const prefetch = useCallback(async (categories: string[], maxAgeMinutes: number = 5) => {
    const promises = categories
      .filter(category => !isCacheValid(category, maxAgeMinutes))
      .map(async (category) => {
        try {
          const response = await fetch(`/api/emails?category=${category}`)
          const data: EmailResponse = await response.json()
          setEmails(category, data.emails, data.cacheInfo)
          return { category, success: true, count: data.emails.length }
        } catch (error) {
          console.error(`Prefetch failed for ${category}:`, error)
          return { category, success: false, count: 0 }
        }
      })
    
    return Promise.allSettled(promises)
  }, [setEmails, isCacheValid])
  
  return { prefetch }
}

// Hook for managing localStorage persistence
export function useEmailPersistence() {
  const { emails, cacheInfo, setEmails } = useEmailStore()
  
  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('email-cache')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed.emails && parsed.cacheInfo) {
          // Check if data is not too old (max 1 hour in localStorage)
          const oneHourAgo = Date.now() - (60 * 60 * 1000)
          const isValid = Object.values(parsed.cacheInfo).some((info: any) => 
            new Date(info.lastFetched).getTime() > oneHourAgo
          )
          
          if (isValid) {
            Object.entries(parsed.emails).forEach(([category, categoryEmails]) => {
              const categoryInfo = parsed.cacheInfo[category]
              if (categoryInfo) {
                setEmails(category, categoryEmails as Email[], categoryInfo)
              }
            })
          }
        }
      }
    } catch (error) {
      console.error('Failed to load from localStorage:', error)
      localStorage.removeItem('email-cache')
    }
  }, [setEmails])
  
  // Save to localStorage when emails change
  useEffect(() => {
    try {
      const dataToStore = {
        emails,
        cacheInfo,
        timestamp: Date.now()
      }
      localStorage.setItem('email-cache', JSON.stringify(dataToStore))
    } catch (error) {
      console.error('Failed to save to localStorage:', error)
    }
  }, [emails, cacheInfo])
  
  const clearCache = useCallback(() => {
    localStorage.removeItem('email-cache')
  }, [])
  
  return { clearCache }
}