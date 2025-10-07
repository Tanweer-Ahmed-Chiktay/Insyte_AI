import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Email {
  id: string
  gmailId: string
  threadId?: string
  subject: string
  from: string
  to: string[]
  snippet: string
  isRead: boolean
  isStarred: boolean
  isImportant: boolean
  labels: string[]
  labelIds?: string[]
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
  removeEmail: (emailId: string) => void
  moveEmailToCategory: (emailId: string, fromCategory: string, toCategory: string) => void
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
      if (!newEmails || newEmails.length === 0) {
        console.log(`[Email Store] No emails to add to category: ${category}`)
        return
      }
      
      set((state) => {
        const existingEmails = state.emails[category] || []
        const existingIds = new Set(existingEmails.map(e => e.id))
        const uniqueNewEmails = newEmails.filter(e => e && e.id && !existingIds.has(e.id))

        console.log(`[Email Store] Adding ${uniqueNewEmails.length} new emails to category: ${category} (${newEmails.length - uniqueNewEmails.length} duplicates filtered)`)
        
        if (uniqueNewEmails.length === 0) {
          console.log(`[Email Store] No unique emails to add to category: ${category}`)
          return state // No changes needed
        }

        const merged = [...existingEmails, ...uniqueNewEmails]
        // Sort newest first by receivedAt if present
        merged.sort((a, b) => {
          const dateA = new Date(a.receivedAt || 0).getTime()
          const dateB = new Date(b.receivedAt || 0).getTime()
          return dateB - dateA
        })

        console.log(`[Email Store] Total emails in category ${category}: ${merged.length}`)

        return {
          emails: {
            ...state.emails,
            [category]: merged
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
    
    removeEmail: (emailId) => {
      set((state) => {
        const newEmails = { ...state.emails }
        
        // Find and remove the email from all categories
        Object.keys(newEmails).forEach(category => {
          newEmails[category] = newEmails[category].filter(email => email.id !== emailId)
        })
        
        return { emails: newEmails }
      })
    },
    
    moveEmailToCategory: (emailId, fromCategory, toCategory) => {
      set((state) => {
        const newEmails = { ...state.emails }
        
        // Find the email in the source category
        const sourceEmails = newEmails[fromCategory] || []
        const emailIndex = sourceEmails.findIndex(email => email.id === emailId)
        
        if (emailIndex !== -1) {
          const email = sourceEmails[emailIndex]
          
          // Remove from source category
          newEmails[fromCategory] = sourceEmails.filter((_, index) => index !== emailIndex)
          
          // Add to target category with updated category field
          const updatedEmail = { ...email, category: toCategory }
          newEmails[toCategory] = [...(newEmails[toCategory] || []), updatedEmail]
        }
        
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