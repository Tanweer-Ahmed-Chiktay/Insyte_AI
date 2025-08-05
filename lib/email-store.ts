import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Email {
  id: string
  gmailId: string
  subject: string
  from: string
  to: string[]
  snippet: string
  isRead: boolean
  isStarred: boolean
  isImportant: boolean
  labels: string[]
  receivedAt: string
  category: string
  summary?: {
    id: string
    summary: string
    keyPoints: string[]
    actionItems: string[]
    createdAt: string
    updatedAt: string
  }
}

export interface CacheInfo {
  source: 'cache' | 'gmail' | 'mixed'
  cached: number
  newlyFetched: number
  lastFetched: string
  hasMore?: boolean
  nextOlderThan?: string
}

interface EmailStore {
  // Email data by category
  emails: Record<string, Email[]>
  cacheInfo: Record<string, CacheInfo>
  
  // Loading states
  loading: Record<string, boolean>
  
  // Actions
  setEmails: (category: string, emails: Email[], cacheInfo: CacheInfo, hasMore?: boolean, nextOlderThan?: string) => void
  addEmails: (category: string, newEmails: Email[]) => void
  updateEmail: (emailId: string, updates: Partial<Email>) => void
  setLoading: (category: string, loading: boolean) => void
  clearCategory: (category: string) => void
  clearAll: () => void
  
  // Getters
  getEmails: (category: string) => Email[]
  getCacheInfo: (category: string) => CacheInfo | null
  isLoading: (category: string) => boolean
  
  // Cache management
  isCacheValid: (category: string, maxAgeMinutes?: number) => boolean
}

const useEmailStore = create<EmailStore>()(persist(
  (set, get) => ({
    emails: {},
    cacheInfo: {},
    loading: {},
    
    setEmails: (category, emails, cacheInfo, hasMore, nextOlderThan) => {
      set((state) => ({
        emails: {
          ...state.emails,
          [category]: emails
        },
        cacheInfo: {
          ...state.cacheInfo,
          [category]: {
            ...cacheInfo,
            lastFetched: new Date().toISOString(),
            hasMore,
            nextOlderThan
          }
        },
        loading: {
          ...state.loading,
          [category]: false
        }
      }))
    },
    
    addEmails: (category, newEmails) => {
      set((state) => {
        const existingEmails = state.emails[category] || []
        const existingIds = new Set(existingEmails.map(e => e.id))
        const uniqueNewEmails = newEmails.filter(e => !existingIds.has(e.id))
        
        return {
          emails: {
            ...state.emails,
            [category]: [...existingEmails, ...uniqueNewEmails]
          }
        }
      })
    },
    
    updateEmail: (emailId, updates) => {
      set((state) => {
        const newEmails = { ...state.emails }
        
        // Update email in all categories where it exists
        Object.keys(newEmails).forEach(category => {
          const emailIndex = newEmails[category].findIndex(e => e.id === emailId)
          if (emailIndex !== -1) {
            newEmails[category] = [
              ...newEmails[category].slice(0, emailIndex),
              { ...newEmails[category][emailIndex], ...updates },
              ...newEmails[category].slice(emailIndex + 1)
            ]
          }
        })
        
        return { emails: newEmails }
      })
    },
    
    setLoading: (category, loading) => {
      set((state) => ({
        loading: {
          ...state.loading,
          [category]: loading
        }
      }))
    },
    
    clearCategory: (category) => {
      set((state) => {
        const newEmails = { ...state.emails }
        const newCacheInfo = { ...state.cacheInfo }
        const newLoading = { ...state.loading }
        
        delete newEmails[category]
        delete newCacheInfo[category]
        delete newLoading[category]
        
        return {
          emails: newEmails,
          cacheInfo: newCacheInfo,
          loading: newLoading
        }
      })
    },
    
    clearAll: () => {
      set({ emails: {}, cacheInfo: {}, loading: {} })
    },
    
    getEmails: (category) => {
      return get().emails[category] || []
    },
    
    getCacheInfo: (category) => {
      return get().cacheInfo[category] || null
    },
    
    isLoading: (category) => {
      return get().loading[category] || false
    },
    
    isCacheValid: (category, maxAgeMinutes = 5) => {
      const cacheInfo = get().cacheInfo[category]
      if (!cacheInfo || !cacheInfo.lastFetched) return false
      
      const lastFetched = new Date(cacheInfo.lastFetched)
      const now = new Date()
      const ageMinutes = (now.getTime() - lastFetched.getTime()) / (1000 * 60)
      
      return ageMinutes < maxAgeMinutes
    }
  }),
  {
    name: 'email-store',
    partialize: (state) => ({
      emails: state.emails,
      cacheInfo: state.cacheInfo
    })
  }
))

export default useEmailStore