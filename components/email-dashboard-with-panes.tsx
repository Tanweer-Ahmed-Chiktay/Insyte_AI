'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { AdvancedRichTextEditor } from '@/components/advanced-rich-text-editor'
import { TimePickerWheel } from '@/components/time-picker-wheel'
import {
  Mail, 
  Search, 
  Star, 
  Archive, 
  Trash2, 
  Send, 
  Plus, 
  Menu, 
  X, 
  Settings, 
  LogOut,
  Sparkles,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  RefreshCw,
  MessageCircle,
  Bot,
  Tag,
  Users,
  Paperclip,
  Download,
  ArrowLeft,
  Calendar,
  Clock,
  ChevronLeft,
  ChevronRight,
  Upload
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/use-toast'
import { AIAssistant } from '@/components/ai-assistant'
import { ContactsTab } from '@/components/contacts-tab'
import { SlackTab } from '@/components/slack-tab'
import { CalendarTab } from '@/components/calendar-tab'
import { AccountSwitcher } from '@/components/account-switcher'
import { startEmailScheduler } from '@/lib/scheduler'
import DOMPurify from 'dompurify'
import { useEmailCache, useEmailPersistence, usePrefetchEmails } from '@/hooks/use-email-cache'
import useEmailStore from '@/lib/email-store'
import { usePusher } from '@/hooks/use-pusher'
import { useEmailPolling } from '@/hooks/use-email-polling'
import { 
  EmailListSkeleton, 
  EmailDetailSkeleton, 
  EmailSidebarSkeleton,
  EmailStatsCardSkeleton 
} from '@/components/ui/skeleton-loader'
import { PaneManager } from '@/components/pane-manager'
import { EmailPane } from '@/components/email-pane'
import { formatEmailDate } from '@/lib/date-utils'
import { VirtualEmailList } from '@/components/virtual-email-list'
import { createCSRFHeaders } from '@/lib/utils/csrf-client'

// Cache configuration
const CACHE_KEYS = {
  EMAILS: 'insyte_emails',
  EMAIL_SUMMARIES: 'insyte_email_summaries',
  LAST_EMAIL_FETCH: 'insyte_last_email_fetch'
}

const saveToCache = (key: string, data: any) => {
  try {
    localStorage.setItem(key, JSON.stringify({
      data,
      timestamp: Date.now()
    }))
  } catch (error) {
    console.warn('Failed to save to cache:', error)
  }
}

const loadFromCache = (key: string, maxAge?: number) => {
  try {
    const cached = localStorage.getItem(key)
    if (!cached) return null
    
    const { data, timestamp } = JSON.parse(cached)
    
    if (maxAge && Date.now() - timestamp > maxAge) {
      localStorage.removeItem(key)
      return null
    }
    
    return data
  } catch (error) {
    console.warn('Failed to load from cache:', error)
    return null
  }
}

interface Email {
  id: string
  subject: string
  from: string
  snippet: string
  receivedAt: string
  isRead: boolean
  isStarred: boolean
  isImportant: boolean
  threadId?: string
  labelIds?: string[]
  labels?: string[]
  summary?: EmailSummary | null
}

interface FullEmail extends Email {
  to: string
  cc: string
  bcc: string
  htmlBody: string
  textBody: string
  attachments: Array<{
    filename: string
    mimeType: string
    attachmentId: string
    size: number
  }>
}

interface EmailSummary {
  id: string
  summary: string
  keyPoints: string[]
  actionItems: string[]
  createdAt: string
  updatedAt: string
}

function SafeHTMLRenderer({ htmlContent }: { htmlContent: string }) {
  const sanitizedHTML = DOMPurify.sanitize(htmlContent, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'a', 'ul', 'ol', 'li', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    ALLOW_DATA_ATTR: false
  })
  
  return (
    <div 
      className="prose prose-sm max-w-none dark:prose-invert"
      dangerouslySetInnerHTML={{ __html: sanitizedHTML }}
    />
  )
}

export default function EmailDashboardWithPanes() {
  const { data: session } = useSession()
  const { toast } = useToast()
  const emailStore = useEmailStore()
  
  // UI State
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)
  const [currentSection, setCurrentSection] = useState('inbox')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null)
  const [fullEmail, setFullEmail] = useState<FullEmail | null>(null)
  const [isComposing, setIsComposing] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [isScheduled, setIsScheduled] = useState(false)
  const [scheduledDate, setScheduledDate] = useState(new Date())
  const [scheduledTime, setScheduledTime] = useState({ hours: 9, minutes: 0 })
  const [showAIAssistant, setShowAIAssistant] = useState(false)
  const [showContacts, setShowContacts] = useState(false)
  const [composeData, setComposeData] = useState({
    to: '',
    subject: '',
    body: ''
  })
  const [composeAttachments, setComposeAttachments] = useState<Array<{
    id: string
    name: string
    size: number
    type: string
    file: File
  }>>([])
  
  // Email data and caching
  const { 
    emails, 
    isLoading, 
    error, 
    refresh,
    loadOlderEmails,
    hasMore,
    nextOlderThan
  } = useEmailCache({ 
    category: currentSection, 
    revalidateOnFocus: false,
    maxAgeMinutes: 10, // Increased from 5 to 10 minutes
    enablePrefetch: false // Disabled to reduce requests
  })
  
  // WebSocket for real-time updates
  // Email store for direct updates
  const { addEmails, updateEmail, removeEmail } = useEmailStore()
  
  // Function to fetch new emails by ID
  const fetchNewEmailsById = useCallback(async (emailIds: string[]) => {
    if (!emailIds || emailIds.length === 0) {
      console.log('No email IDs provided to fetch')
      return
    }
    
    try {
      console.log('Fetching new emails by ID:', emailIds)
      const response = await fetch('/api/emails/by-ids', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ emailIds, category: currentSection })
      })
      
      if (response.ok) {
        const data = await response.json()
        console.log('API response for new emails:', data)
        const fetched = Array.isArray(data) ? data : (data?.emails || [])
        if (fetched && fetched.length > 0) {
          console.log(`Adding ${fetched.length} new emails to store for section: ${currentSection}`)
          addEmails(currentSection, fetched)
          toast({
            title: "New emails received",
            description: `${fetched.length} new email(s) added instantly`,
            duration: 3000
          })
        } else {
          console.log('No emails returned from API or empty response')
        }
      } else {
        console.error('Failed to fetch emails by ID:', response.status, response.statusText)
        if (response.status === 401) {
          console.log('Authentication issue, user may need to re-login')
        }
      }
    } catch (error) {
      console.error('Failed to fetch new emails by ID:', error)
      // Don't call refresh here to prevent infinite loops
    }
  }, [currentSection, addEmails, toast])
  
  // Function to add email directly to store
  const addEmailToStore = useCallback((email: any) => {
    console.log('🏪 addEmailToStore called:', {
      email: email,
      currentSection,
      hasAddEmails: !!addEmails
    })
    
    if (email && email.id) {
      console.log('📥 Calling addEmails with:', { currentSection, emailCount: 1 })
      addEmails(currentSection, [email])
      
      console.log('🎉 Showing toast notification')
      toast({
        title: "New email received",
        description: `From: ${email.from}`,
        duration: 3000
      })
    } else {
      console.log('❌ addEmailToStore validation failed')
    }
  }, [currentSection, addEmails, toast])
  
  // Function to remove email from store
  const removeEmailFromStore = useCallback((emailId: string) => {
    if (emailId) {
      removeEmail(emailId)
      toast({
        title: "Email deleted",
        description: "Email removed from your inbox",
        duration: 2000
      })
    }
  }, [removeEmail, toast])

  // Memoized WebSocket callbacks to prevent infinite re-renders
  const handleEmailUpdate = useCallback((data: any) => {
    console.log('Email update received:', data)
    // Handle specific email updates without full refresh
    if (data.action === 'added' && data.emailIds?.length > 0) {
      console.log('Fetching new emails by IDs:', data.emailIds)
      // Fetch only the new emails and add them to the store
      fetchNewEmailsById(data.emailIds)
    } else if (data.action === 'added' && data.count > 0) {
      // If we don't have specific IDs but know emails were added, trigger a refresh
      console.log('New emails detected without IDs, triggering refresh')
      refresh(false) // Use cached data if available
    }
    // Removed refresh() call to prevent infinite loop
  }, [fetchNewEmailsById, refresh])

  const handleNewEmail = useCallback((email: any) => {
    console.log('🎯 handleNewEmail called with:', email)
    console.log('📊 Email validation:', {
      hasEmail: !!email,
      hasId: !!email?.id,
      currentSection,
      emailId: email?.id
    })
    
    // If we have the full email object, add it directly to the store
    if (email && email.id) {
      console.log('✅ Adding email to store via addEmailToStore')
      addEmailToStore(email)
    } else {
      console.log('❌ Email validation failed - not adding to store')
    }
    // Removed refresh() call to prevent infinite loop
  }, [addEmailToStore, currentSection])

  const handleEmailDeleted = useCallback((emailId: string) => {
    console.log('Email deleted:', emailId)
    // Remove email directly from store
    if (emailId) {
      removeEmailFromStore(emailId)
    }
  }, [removeEmailFromStore])

  const handleSyncStatus = useCallback((status: any) => {
    console.log('Sync status:', status)
  }, [])

  // WebSocket options - memoized to prevent constant re-initialization
  const webSocketOptions = useMemo(() => ({
    debug: true, // Enable debug logging
    onEmailUpdate: handleEmailUpdate,
    onNewEmail: handleNewEmail,
    onEmailDeleted: handleEmailDeleted,
    onSyncStatus: handleSyncStatus
  }), [handleEmailUpdate, handleNewEmail, handleEmailDeleted, handleSyncStatus])

  // Pusher for real-time updates
  const { isConnected: wsConnected, reconnect, error: wsError } = usePusher(webSocketOptions)
  
  // Email polling fallback when WebSocket is not available
  const isWebSocketUnavailable = wsError?.includes('WebSocket not available') || wsError?.includes('polling mode')
  
  useEmailPolling({
    enabled: true, // Always enable polling for now to ensure new emails are detected
    interval: 86400000, // 24 hours
    onNewEmails: (newEmails) => {
      console.log('Polling detected new emails:', newEmails)
      console.log('Current section:', currentSection)
      console.log('New emails count:', newEmails?.length || 0)
      if (newEmails && newEmails.length > 0) {
        console.log('Adding emails to store for section:', currentSection)
        addEmails(currentSection, newEmails)
        console.log('Emails added to store successfully')
        toast({
          title: "New emails received",
          description: `${newEmails.length} new email(s) detected via polling`,
          duration: 3000
        })
      } else {
        console.log('No new emails to add or newEmails is empty/null')
      }
    },
    onError: (error) => {
      console.error('Email polling error:', error)
    },
    debug: true
  })
  
  // Older emails range tracking
  const [olderEmailsRange, setOlderEmailsRange] = useState(60) // Start with 60-90 days
  
  // Debug logging (only log when values change)
  useEffect(() => {
    console.log(`Dashboard Debug - hasMore: ${hasMore}, nextOlderThan: ${nextOlderThan}, emailsCount: ${emails.length}, section: ${currentSection}`)
  }, [hasMore, nextOlderThan, emails.length, currentSection])
  useEmailPersistence()
  // Removed usePrefetchEmails() to reduce API requests
  
  // Add state for active pane
  const [activePaneId, setActivePaneId] = useState<string>('main')
  const paneUpdateRef = useRef<((paneId: string, updates: Partial<any>) => void) | null>(null)
  const dragHandlersRef = useRef<{ onDragStart: (email: Email) => void, onDragEnd: () => void } | null>(null)
  const panesRef = useRef<any[]>([])
  const activePaneRef = useRef<string>('main')
  
  // Handle window resize for responsive design
  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 768)
    }
    
    handleResize() // Set initial value
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Gmail watch enabled - real-time push notifications from Gmail
  // Requires Google Cloud Pub/Sub configuration with MyTopic and MySub
  useEffect(() => {
    // Gmail watch setup for real-time email notifications
    const setupGmailWatch = async () => {
      if (!session?.user?.email) return
      try {
        console.log('Setting up Gmail watch for real-time notifications')
        
        // Get CSRF token first
        // Make the watch setup request with CSRF token
        const response = await fetch('/api/gmail/watch', { 
          method: 'POST',
          headers: await createCSRFHeaders()
        })
        
        if (response.ok) {
          const data = await response.json()
          console.log('Gmail watch setup successfully:', data)
          toast({
            title: 'Gmail Watch Active',
            description: 'Real-time email notifications enabled',
            duration: 3000
          })
        } else {
          const error = await response.json()
          console.warn('Failed to setup Gmail watch:', error)
          toast({
            title: 'Gmail Watch Setup Failed',
            description: error.error || 'Failed to enable real-time notifications',
            variant: 'destructive'
          })
        }
      } catch (error) {
        console.warn('Failed to setup Gmail watch:', error)
        toast({
          title: 'Gmail Watch Error',
          description: 'Failed to enable real-time notifications',
          variant: 'destructive'
        })
      }
    }
    
    const timer = setTimeout(setupGmailWatch, 1000)
    return () => clearTimeout(timer)
  }, [session?.user?.email, toast])

  // Real-time updates are now handled by the WebSocket hook above
  // The useWebSocket hook automatically handles Gmail push notifications,
  // email updates, and sync status changes
  
  // Listen for custom events dispatched by the WebSocket hook
  useEffect(() => {
    const handleEmailListRefresh = (event: CustomEvent) => {
      const { category, action } = event.detail
      console.log(`[Email List Refresh] Category: ${category}, Action: ${action}, Current: ${currentSection}`)
      
      // Only refresh if the event is for the current section
      if (category === currentSection || category === 'inbox') {
        console.log(`[Email List Refresh] Refreshing ${currentSection} due to ${action} in ${category}`)
        refresh(false) // Use cached data if available
      }
    }

    const handleNewEmailReceived = (event: CustomEvent) => {
      const newEmail = event.detail
      console.log('[New Email Received]', newEmail)
      
      if (newEmail && newEmail.id) {
        // Add to the appropriate section if it belongs there
        const emailLabels = newEmail.labelIds || newEmail.labels || []
        let shouldAddToCurrentSection = false
        
        switch (currentSection) {
          case 'inbox':
            shouldAddToCurrentSection = !emailLabels.includes('SENT') && !emailLabels.includes('DRAFT') && !emailLabels.includes('TRASH')
            break
          case 'starred':
            shouldAddToCurrentSection = newEmail.isStarred
            break
          case 'important':
            shouldAddToCurrentSection = newEmail.isImportant
            break
          case 'unread':
            shouldAddToCurrentSection = !newEmail.isRead
            break
          default:
            shouldAddToCurrentSection = false
        }
        
        if (shouldAddToCurrentSection) {
          addEmails(currentSection, [newEmail])
          toast({
            title: "New email received",
            description: `From: ${newEmail.from}`,
            duration: 3000
          })
        }
      }
    }

    window.addEventListener('email-list-refresh', handleEmailListRefresh as EventListener)
    window.addEventListener('new-email-received', handleNewEmailReceived as EventListener)
    
    return () => {
      window.removeEventListener('email-list-refresh', handleEmailListRefresh as EventListener)
      window.removeEventListener('new-email-received', handleNewEmailReceived as EventListener)
    }
  }, [currentSection, refresh, addEmails, toast])
  
  // Filter emails based on current section and search
   const filteredEmails = emails.filter(email => {
      const matchesSearch = !searchQuery || 
        email.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
        email.from.toLowerCase().includes(searchQuery.toLowerCase()) ||
        email.snippet.toLowerCase().includes(searchQuery.toLowerCase())
      
      const emailLabels = (email as any).labelIds || (email as any).labels || []
      
      // Helper function to check if email has any of the specified labels
      const hasAnyLabel = (labels: string[]) => labels.some(label => emailLabels.includes(label))
      
      // Define Gmail label constants for better organization
      const GMAIL_LABELS = {
        SENT: ['SENT', 'SENT_MAIL'],
        DRAFT: ['DRAFT', 'DRAFTS'],
        TRASH: ['TRASH', 'BIN', 'DELETED', 'SPAM'],
        ARCHIVE: ['ARCHIVE', 'ARCHIVED'],
        PROMOTIONS: ['CATEGORY_PROMOTIONS', 'PROMOTIONS'],
        SOCIAL: ['CATEGORY_SOCIAL', 'SOCIAL'],
        UPDATES: ['CATEGORY_UPDATES', 'UPDATES'],
        FORUMS: ['CATEGORY_FORUMS', 'FORUMS']
      }
      
      switch (currentSection) {
        case 'inbox':
          return matchesSearch && 
                 !hasAnyLabel(GMAIL_LABELS.SENT) && 
                 !hasAnyLabel(GMAIL_LABELS.DRAFT) && 
                 !hasAnyLabel(GMAIL_LABELS.TRASH) &&
                 !hasAnyLabel(GMAIL_LABELS.ARCHIVE)
        case 'starred':
          return matchesSearch && email.isStarred && !hasAnyLabel(GMAIL_LABELS.TRASH)
        case 'sent':
          return matchesSearch && hasAnyLabel(GMAIL_LABELS.SENT) && !hasAnyLabel(GMAIL_LABELS.TRASH)
        case 'drafts':
          return matchesSearch && hasAnyLabel(GMAIL_LABELS.DRAFT) && !hasAnyLabel(GMAIL_LABELS.TRASH)
        case 'important':
          return matchesSearch && email.isImportant && !hasAnyLabel(GMAIL_LABELS.TRASH)
        case 'promotions':
          return matchesSearch && hasAnyLabel(GMAIL_LABELS.PROMOTIONS) && !hasAnyLabel(GMAIL_LABELS.TRASH)
        case 'social':
          return matchesSearch && hasAnyLabel(GMAIL_LABELS.SOCIAL) && !hasAnyLabel(GMAIL_LABELS.TRASH)
        case 'trash':
          return matchesSearch && hasAnyLabel(GMAIL_LABELS.TRASH)
        case 'archive':
          return matchesSearch && hasAnyLabel(GMAIL_LABELS.ARCHIVE) && !hasAnyLabel(GMAIL_LABELS.TRASH)
        case 'calendar':
          // For calendar, we'll show a placeholder for now - this would need calendar integration
          return false
        case 'slack':
          // For slack, we'll handle this in the SlackTab component
          return false
        default:
          return matchesSearch
      }
    })
  
  // Email stats
  const emailStats = {
    total: emails.length,
    unread: emails.filter(e => !e.isRead).length,
    starred: emails.filter(e => e.isStarred).length,
    important: emails.filter(e => e.isImportant).length
  }
  
  // Note: Email scheduler is auto-started in production via scheduler.ts
  // Scheduler is automatically started in lib/scheduler.ts
  
  const handleEmailSelect = useCallback(async (email: Email, paneId?: string) => {
    console.log('handleEmailSelect called with:', email.id, email.subject, 'paneId:', paneId)
    try {
      // Mark email as read
      if (!email.isRead) {
        console.log('Marking email as read:', email.id)
        emailStore.updateEmail(email.id, { isRead: true })
        
        try {
          const headers = await createCSRFHeaders()
          await fetch(`/api/emails/${email.id}/read`, {
            method: 'POST',
            headers
          })
        } catch (error) {
          console.error('Error marking email as read:', error)
        }
      }

      // Load email into the main pane using the pane manager
      const targetPaneId = paneId || 'main'
      console.log('Using targetPaneId:', targetPaneId, 'paneUpdateRef.current exists:', !!paneUpdateRef.current)
      if (paneUpdateRef.current) {
        // Set loading state
        console.log('Setting loading state for pane:', targetPaneId)
        paneUpdateRef.current(targetPaneId, { email, isLoading: true, fullEmail: null })
        
        // Fetch full email content
        console.log('Fetching full email content for:', email.id)
        const response = await fetch(`/api/emails/${email.id}`)
        if (!response.ok) {
          if (response.status === 401) {
            throw new Error('Authentication expired. Please sign in again.')
          } else if (response.status === 404) {
            throw new Error('Email not found')
          } else {
            throw new Error(`Failed to fetch email (${response.status})`)
          }
        }
        
        const fullEmail: FullEmail = await response.json()
        setFullEmail(fullEmail)
        
        // Update pane with full email content
        paneUpdateRef.current(targetPaneId, { fullEmail, isLoading: false })
        
        return fullEmail
      }
      
      return null
    } catch (error) {
      console.error('Error fetching email:', error)
      if (paneUpdateRef.current) {
        paneUpdateRef.current(paneId || 'main', { isLoading: false })
      }
      
      const errorMessage = error instanceof Error ? error.message : 'Failed to load email content'
      
      // Check if it's an authentication error
       if (errorMessage.includes('Authentication expired') || errorMessage.includes('sign in again')) {
         toast({
           title: 'Authentication Required',
           description: 'Your session has expired. Please refresh the page to continue.',
           variant: 'destructive'
         })
         // Auto-refresh after a delay
         setTimeout(() => {
           window.location.reload()
         }, 3000)
      } else {
        toast({
          title: 'Error',
          description: errorMessage,
          variant: 'destructive'
        })
      }
      return null
    }
  }, [emailStore, toast])
  
  const loadEmailIntoPane = useCallback(async (email: Email, paneId?: string) => {
       console.log('loadEmailIntoPane called with:', email.id, email.subject, 'paneId:', paneId)
       // If no specific pane is provided, use the active pane or find the best available pane
       let targetPane: string = paneId || activePaneRef.current || 'main'
       if (!paneId) {
         // Prefer the active pane, then find the best pane to load into (preferring empty panes, then any existing pane)
         const availablePanes = panesRef.current
         console.log('Available panes:', availablePanes.map(p => ({ id: p.id, hasEmail: !!p.email })))
         const activePane = availablePanes.find(p => p.id === activePaneRef.current)
         const emptyPane = availablePanes.find(p => !p.email)
         const anyPane = availablePanes[0] // Use first pane if no empty ones
         targetPane = activePane?.id || emptyPane?.id || anyPane?.id || 'main'
       }
       console.log('Target pane selected:', targetPane)
       
       try {
         // Call handleEmailSelect which will handle all pane updates internally
         console.log('Calling handleEmailSelect with targetPane:', targetPane)
         const fullEmail = await handleEmailSelect(email, targetPane)
         console.log('handleEmailSelect completed, fullEmail:', !!fullEmail)
         return fullEmail
       } catch (error) {
         console.error('Error loading email into pane:', error)
         return null
       }
     }, [handleEmailSelect])
  
  const handleEmailAction = useCallback(async (action: string, email: Email) => {
    try {
      switch (action) {
        case 'star':
          emailStore.updateEmail(email.id, { isStarred: !email.isStarred })
          const starHeaders = await createCSRFHeaders()
          await fetch(`/api/emails/${email.id}/star`, {
            method: 'POST',
            headers: starHeaders,
            body: JSON.stringify({ starred: !email.isStarred })
          })
          break
        case 'archive':
          emailStore.updateEmail(email.id, { isRead: true })
          const archiveHeaders = await createCSRFHeaders()
          await fetch(`/api/emails/${email.id}/archive`, { 
            method: 'POST',
            headers: archiveHeaders
          })
          break
        case 'delete':
          emailStore.updateEmail(email.id, { isRead: true })
          const deleteHeaders = await createCSRFHeaders()
          await fetch(`/api/emails/${email.id}`, { 
            method: 'DELETE',
            headers: deleteHeaders
          })
          break
        default:
          console.log(`Action ${action} not implemented yet`)
      }
    } catch (error) {
      console.error(`Error performing ${action}:`, error)
      toast({
        title: 'Error',
        description: `Failed to ${action} email`,
        variant: 'destructive'
      })
    }
  }, [emailStore, toast])
  
  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  }
  
  const handleSendEmail = async () => {
    if (!validateEmail(composeData.to)) {
      toast({
        title: 'Invalid Email',
        description: 'Please enter a valid email address.',
        variant: 'destructive'
      })
      return
    }

    setIsSending(true)
    try {
      const emailData = {
        ...composeData,
        attachments: composeAttachments,
        isScheduled,
        scheduledDate: isScheduled ? scheduledDate : undefined,
        scheduledTime: isScheduled ? scheduledTime : undefined
      }

      // Create FormData for the API endpoint
      const formData = new FormData()
      formData.append('to', composeData.to)
      formData.append('subject', composeData.subject)
      formData.append('htmlBody', composeData.body)
      formData.append('attachmentCount', composeAttachments.length.toString())
      
      // Add attachments to FormData
      composeAttachments.forEach((attachment, index) => {
        if (attachment.file) {
          formData.append(`attachment_${index}`, attachment.file)
        }
      })
      
      // Add scheduling information if applicable
      if (isScheduled && scheduledDate && scheduledTime) {
        const scheduledDateTime = new Date(scheduledDate)
        scheduledDateTime.setHours(scheduledTime.hours, scheduledTime.minutes)
        formData.append('scheduledAt', scheduledDateTime.toISOString())
      }

      const response = await fetch('/api/send-email', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || `Failed to send email (${response.status})`)
      }

      toast({
        title: isScheduled ? 'Email Scheduled' : 'Email Sent',
        description: isScheduled 
          ? `Email scheduled for ${scheduledDate.toLocaleDateString()} at ${scheduledTime.hours}:${scheduledTime.minutes.toString().padStart(2, '0')}`
          : 'Your email has been sent successfully.'
      })

      // Reset form
      setComposeData({ to: '', subject: '', body: '' })
      setComposeAttachments([])
      setIsComposing(false)
      setIsScheduled(false)
      
      // Refresh sent emails if we're in that section
      if (currentSection === 'sent') {
        refresh(true)
      }
    } catch (error) {
      console.error('Error sending email:', error)
      
      let errorMessage = 'Failed to send email. Please try again.'
      
      if (error instanceof Error) {
        if (error.message.includes('Rate limit exceeded')) {
          errorMessage = 'Too many email requests. Please wait a minute and try again.'
        } else if (error.message.includes('quota exceeded')) {
          errorMessage = 'Daily email limit reached. Please try again tomorrow.'
        } else if (error.message.includes('Authentication expired')) {
          errorMessage = 'Your session has expired. Please sign out and sign in again.'
        } else {
          errorMessage = error.message
        }
      }
      
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive'
      })
    } finally {
      setIsSending(false)
    }
  }
  
  const handleAutoSave = (data: any) => {
    localStorage.setItem('email_draft', JSON.stringify({
      ...composeData,
      ...data,
      timestamp: Date.now()
    }))
  }
  
  const handleRemoveAttachment = (attachmentId: string) => {
    setComposeAttachments(prev => prev.filter(att => att.id !== attachmentId))
  }
  
  if (!session) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <Mail className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Please sign in</h2>
          <p className="text-muted-foreground">You need to be signed in to access your emails.</p>
        </div>
      </div>
    )
  }
  
  return (
    <div className="h-screen flex bg-background overflow-hidden">
      {/* Sidebar */}
      <AnimatePresence>
        {(isSidebarOpen || isDesktop) && (
          <motion.aside
            initial={{ x: -300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="w-64 bg-card border-r border-border flex flex-col fixed md:relative z-50 h-full overflow-y-auto"
          >
            {/* Sidebar Header */}
            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                    <Mail className="h-4 w-4 text-white" />
                  </div>
                  <span className="font-semibold text-lg">InSyte</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsSidebarOpen(false)}
                  className="md:hidden h-8 w-8 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            {/* Navigation */}
            <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
              {[
                { id: 'inbox', label: 'Inbox', icon: Mail, count: emailStats.unread },
                { id: 'starred', label: 'Starred', icon: Star, count: emailStats.starred },
                { id: 'sent', label: 'Sent', icon: Send },
                { id: 'drafts', label: 'Drafts', icon: Archive },
                { id: 'important', label: 'Important', icon: Tag, count: emailStats.important },
                { id: 'promotions', label: 'Promotions', icon: Sparkles, count: 0 },
                { id: 'social', label: 'Social', icon: Users, count: 0 },
                { id: 'trash', label: 'Trash', icon: Trash2, count: 0 },
                { id: 'archive', label: 'Archive', icon: Archive, count: 0 },
                { id: 'calendar', label: 'Calendar', icon: Calendar, count: 0 },
                { id: 'slack', label: 'Slack', icon: MessageCircle, count: 0 }
              ].map((item) => (
                <Button
                  key={item.id}
                  variant={currentSection === item.id ? 'secondary' : 'ghost'}
                  className="w-full justify-start"
                  onClick={() => setCurrentSection(item.id)}
                >
                  <item.icon className="mr-2 h-4 w-4" />
                  {item.label}
                  {item.count !== undefined && item.count > 0 && (
                    <span className="ml-auto bg-primary text-primary-foreground text-xs px-2 py-1 rounded-full">
                      {item.count}
                    </span>
                  )}
                </Button>
              ))}
            </nav>
            
            {/* Sidebar Footer */}
            <div className="p-4 border-t border-border space-y-2">
              <Button
                variant="ghost"
                className="w-full justify-start"
                onClick={() => setShowContacts(true)}
              >
                <Users className="mr-2 h-4 w-4" />
                Contacts
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start"
                onClick={() => setShowAIAssistant(true)}
              >
                <Bot className="mr-2 h-4 w-4" />
                AI Assistant
              </Button>
              <AccountSwitcher />
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full min-h-0">
        {/* Header */}
        <header className="bg-card border-b border-border p-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden"
            >
              <Menu className="h-4 w-4" />
            </Button>
            
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search emails..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 w-64"
              />
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            {/* WebSocket Connection Status */}
            <div className="flex items-center space-x-1 text-xs text-muted-foreground">
              <div className={cn(
                "w-2 h-2 rounded-full",
                wsConnected ? "bg-green-500" : "bg-red-500"
              )} />
              <span className="hidden sm:inline">
                {wsConnected ? 'Live' : 'Offline'}
              </span>
              {!wsConnected && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={reconnect}
                  className="h-6 px-2 text-xs"
                >
                  Reconnect
                </Button>
              )}
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                console.log('[Manual Refresh] User clicked refresh button')
                await refresh(true)
                console.log('[Manual Refresh] Refresh completed')
                toast({
                  title: 'Emails Refreshed',
                  description: 'Email list has been updated with latest data',
                  duration: 2000
                })
              }}
              disabled={isLoading}
            >
              <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
              Refresh
            </Button>
            
            <Button
              onClick={() => setIsComposing(true)}
              size="sm"
            >
              <Plus className="h-4 w-4 mr-2" />
              Compose
            </Button>
          </div>
        </header>
        
        {/* Content Area */}
        <div className="flex-1 flex min-h-0">
          {currentSection === 'slack' ? (
            <SlackTab />
          ) : currentSection === 'calendar' ? (
            <CalendarTab />
          ) : isDesktop ? (
            <div className="flex-1 flex min-h-0">
              {/* Email List Panel */}
              <div className="w-80 border-r border-border flex flex-col flex-shrink-0 min-h-0">
                <div className="p-3 border-b border-border">
                  <h2 className="text-sm font-semibold capitalize">{currentSection}</h2>
                  <p className="text-xs text-muted-foreground">{filteredEmails.length} emails</p>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                  {isLoading ? (
                    <EmailListSkeleton />
                  ) : error ? (
                    <div className="p-8 text-center">
                      <Mail className="mx-auto h-12 w-12 text-red-500 mb-4" />
                      <h3 className="text-lg font-medium mb-2">Failed to load emails</h3>
                      <p className="text-muted-foreground mb-4">
                        {error.message || 'Something went wrong. Please try again.'}
                      </p>
                      <Button onClick={() => refresh(true)} variant="outline">
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Retry
                      </Button>
                    </div>
                  ) : filteredEmails.length === 0 ? (
                    <div className="p-8 text-center">
                      <Mail className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                      <h3 className="text-lg font-medium mb-2">No emails found</h3>
                      <p className="text-muted-foreground mb-4">
                        {searchQuery ? 'Try adjusting your search query.' : 'Your inbox is empty or still loading.'}
                      </p>
                    </div>
                  ) : (
                    <div className="h-full">
                      <VirtualEmailList
                        emails={filteredEmails.map(email => ({
                          id: email.id,
                          subject: email.subject,
                          from: email.from,
                          snippet: email.snippet,
                          date: email.receivedAt,
                          isRead: email.isRead,
                          isStarred: email.isStarred,
                          isImportant: email.isImportant,
                          hasAttachments: false, // Add attachment detection logic if needed
                          summary: email.summary ? {
                            summary: email.summary.summary,
                            keyPoints: email.summary.keyPoints
                          } : undefined
                        }))}
                        onEmailSelect={(email) => {
                          console.log('Desktop: Email clicked:', email.id, email.subject)
                          const originalEmail = filteredEmails.find(e => e.id === email.id)
                          if (originalEmail) {
                            console.log('Desktop: Found original email, setting selected and loading into pane')
                            setSelectedEmail(originalEmail)
                            loadEmailIntoPane(originalEmail)
                          } else {
                            console.error('Desktop: Original email not found for ID:', email.id)
                          }
                        }}
                        onEmailDrop={(emailId: string, targetPane: string) => {
                          const email = filteredEmails.find(e => e.id === emailId)
                          if (email && dragHandlersRef.current) {
                            dragHandlersRef.current.onDragStart(email)
                            loadEmailIntoPane(email, targetPane)
                            dragHandlersRef.current.onDragEnd()
                          }
                        }}
                        selectedEmailId={selectedEmail?.id}
                      />
                      
                      {/* Load More Button */}
                      {hasMore && (
                        <div className="p-2">
                          <Button
                             variant="outline"
                             size="sm"
                             onClick={async () => {
                               if (!nextOlderThan) return
                               try {
                                 await loadOlderEmails(nextOlderThan)
                                 toast({
                                   title: 'Success',
                                   description: 'Older emails loaded successfully'
                                 })
                               } catch (error) {
                                 toast({
                                   title: 'Error',
                                   description: 'Failed to load older emails',
                                   variant: 'destructive'
                                 })
                               }
                             }}
                             disabled={isLoading || !nextOlderThan}
                             className="w-full"
                           >
                            {isLoading ? (
                              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <ChevronRight className="h-4 w-4 mr-2" />
                            )}
                            Load older emails
                          </Button>
                        </div>
                      )}
                      
                      {/* View Older Emails Button (60-90 days) - Always visible */}
                      <div className="p-2">
                        <Button
                          variant="default"
                          size="sm"
                          onClick={async () => {
                             try {
                               console.log('View older emails button clicked, current range:', olderEmailsRange)
                               const olderThanDays = olderEmailsRange + 30 // e.g., 90 days for 60-90 range
                               const olderThanDate = new Date()
                               olderThanDate.setDate(olderThanDate.getDate() - olderThanDays)
                               
                               const apiUrl = '/api/emails?category=' + currentSection + '&olderThan=' + olderThanDate.toISOString() + '&maxResults=50'
                               console.log('Fetching from API:', apiUrl)
                               const response = await fetch(apiUrl)
                               if (!response.ok) {
                                 throw new Error('Failed to fetch older emails')
                               }
                               
                               const data = await response.json()
                               console.log('API response data:', data)
                               
                               // The API already filters emails correctly (30 days before olderThan to olderThan)
                               // So we can use all returned emails without additional filtering
                               const filteredEmails = data.emails || []
                               console.log('Filtered emails count:', filteredEmails.length)
                              
                              const currentEmails = emails
                              const combinedEmails = [...currentEmails, ...filteredEmails]
                              
                              emailStore.setEmails(currentSection, combinedEmails, {
                                source: 'gmail',
                                cached: currentEmails.length,
                                newlyFetched: filteredEmails.length,
                                lastFetched: new Date().toISOString()
                              })
                              
                              toast({
                                title: 'Success',
                                description: 'Loaded ' + filteredEmails.length + ' emails from ' + olderEmailsRange + '-' + (olderEmailsRange + 30) + ' days ago'
                              })
                              
                              // Update the range for next click
                              setOlderEmailsRange(olderEmailsRange + 30)
                            } catch (error) {
                              toast({
                                title: 'Error',
                                description: 'Failed to load older emails',
                                variant: 'destructive'
                              })
                            }
                          }}
                          disabled={isLoading}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                        >
                          {isLoading ? (
                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Calendar className="h-4 w-4 mr-2" />
                          )}
                          View older emails ({olderEmailsRange}-{olderEmailsRange + 30} days)
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Panes Area */}
                <div className="flex-1 min-h-0">
                  <PaneManager
                    emails={filteredEmails}
                    onEmailSelect={handleEmailSelect}
                  >
                    {(panes, onPaneUpdate, dragHandlers, currentPaneId, activePane) => {
                       // Store the onPaneUpdate function, drag handlers, panes, and activePane in refs
                       paneUpdateRef.current = onPaneUpdate
                       dragHandlersRef.current = dragHandlers
                       panesRef.current = panes
                       activePaneRef.current = activePane
                       
                       // Find the current pane being rendered
                       const pane = panes.find(p => p.id === currentPaneId)
                       if (!pane) {
                         return (
                           <div className="flex items-center justify-center h-full text-muted-foreground">
                             <div className="text-center">
                               <div className="text-lg mb-2">📧</div>
                               <p>Drag an email here to view</p>
                               <p className="text-xs mt-1">or click an email from the list</p>
                             </div>
                           </div>
                         )
                       }
                       
                       if (pane.email) {
                         return (
                           <EmailPane
                             email={pane.email}
                             fullEmail={pane.fullEmail}
                             isLoading={pane.isLoading}
                             onEmailAction={handleEmailAction}
                           />
                         )
                       }
                       
                       return (
                         <div className="flex items-center justify-center h-full text-muted-foreground">
                           <div className="text-center">
                             <div className="text-lg mb-2">📧</div>
                             <p>Drag an email here to view</p>
                             <p className="text-xs mt-1">or click an email from the list</p>
                           </div>
                         </div>
                       )
                    }}
                  </PaneManager>
                </div>
            </div>
          ) : (
            /* Mobile Layout */
            <div className="flex-1 flex flex-col min-h-0">
              {selectedEmail ? (
                <div className="flex-1">
                  <div className="p-4 border-b border-border flex items-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedEmail(null)}
                      className="mr-2"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <h2 className="font-semibold">Email Details</h2>
                  </div>
                  <EmailPane
                    email={selectedEmail}
                    fullEmail={fullEmail}
                    isLoading={false}
                    onEmailAction={handleEmailAction}
                  />
                </div>
              ) : (
                <div className="flex-1 flex flex-col">
                  <div className="p-3 border-b border-border">
                    <h2 className="text-sm font-semibold capitalize">{currentSection}</h2>
                    <p className="text-xs text-muted-foreground">{filteredEmails.length} emails</p>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {isLoading ? (
                      <EmailListSkeleton />
                    ) : error ? (
                      <div className="p-8 text-center">
                        <Mail className="mx-auto h-12 w-12 text-red-500 mb-4" />
                        <h3 className="text-lg font-medium mb-2">Failed to load emails</h3>
                        <p className="text-muted-foreground mb-4">
                          {error.message || 'Something went wrong. Please try again.'}
                        </p>
                        <Button onClick={() => refresh(true)} variant="outline">
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Retry
                        </Button>
                      </div>
                    ) : filteredEmails.length === 0 ? (
                      <div className="p-8 text-center">
                        <Mail className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                        <h3 className="text-lg font-medium mb-2">No emails found</h3>
                        <p className="text-muted-foreground mb-4">
                          {searchQuery ? 'Try adjusting your search query.' : 'Your inbox is empty or still loading.'}
                        </p>
                      </div>
                    ) : (
                      <div className="h-full">
                        <VirtualEmailList
                            emails={filteredEmails.map(email => ({
                              id: email.id,
                              subject: email.subject,
                              from: email.from,
                              snippet: email.snippet,
                              date: email.receivedAt,
                              isRead: email.isRead,
                              isStarred: email.isStarred,
                              isImportant: email.isImportant,
                              hasAttachments: false, // Add attachment detection logic if needed
                              summary: email.summary ? {
                                summary: email.summary.summary,
                                keyPoints: email.summary.keyPoints
                              } : undefined
                            }))}
                            onEmailSelect={(selectedEmailItem) => {
                              console.log('Mobile: Email clicked:', selectedEmailItem.id, selectedEmailItem.subject)
                              const originalEmail = filteredEmails.find((e: Email) => e.id === selectedEmailItem.id)
                              if (originalEmail) {
                                console.log('Mobile: Found original email, setting selected and loading into pane')
                                setSelectedEmail(originalEmail)
                                loadEmailIntoPane(originalEmail)
                              } else {
                                console.error('Mobile: Original email not found for ID:', selectedEmailItem.id)
                              }
                            }}
                            onEmailDrop={(emailId: string, targetPane: string) => {
                               const email = filteredEmails.find((e: Email) => e.id === emailId)
                               if (email) {
                                 setSelectedEmail(email)
                                 loadEmailIntoPane(email, targetPane)
                               }
                             }}
                            selectedEmailId={(selectedEmail as Email | null)?.id}
                          />
                        
                        {/* Load More Button */}
                        {hasMore && (
                          <div className="p-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                if (!nextOlderThan) return
                                try {
                                  await loadOlderEmails(nextOlderThan)
                                  toast({
                                    title: 'Success',
                                    description: 'Older emails loaded successfully'
                                  })
                                } catch (error) {
                                  toast({
                                    title: 'Error',
                                    description: 'Failed to load older emails',
                                    variant: 'destructive'
                                  })
                                }
                              }}
                              disabled={isLoading || !nextOlderThan}
                              className="w-full"
                            >
                              {isLoading ? (
                                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <ChevronRight className="h-4 w-4 mr-2" />
                              )}
                              Load older emails
                            </Button>
                          </div>
                        )}
                        
                        {/* View Older Emails Button (60-90 days) - Always visible */}
                        <div className="p-2">
                          <Button
                            variant="default"
                            size="sm"
                            onClick={async () => {
                                 try {
                                   console.log('Mobile view older emails button clicked, current range:', olderEmailsRange)
                                   const olderThanDays = olderEmailsRange + 30 // e.g., 90 days for 60-90 range
                                   const olderThanDate = new Date()
                                   olderThanDate.setDate(olderThanDate.getDate() - olderThanDays)
                                   
                                   const apiUrl = '/api/emails?category=' + currentSection + '&olderThan=' + olderThanDate.toISOString() + '&maxResults=50'
                                   console.log('Mobile fetching from API:', apiUrl)
                                   const response = await fetch(apiUrl)
                                if (!response.ok) {
                                  throw new Error('Failed to fetch older emails')
                                }
                                
                                const data = await response.json()
                                   console.log('Mobile API response data:', data)
                                   
                                   // The API already filters emails correctly (30 days before olderThan to olderThan)
                                   // So we can use all returned emails without additional filtering
                                   const filteredEmails = data.emails || []
                                   console.log('Mobile filtered emails count:', filteredEmails.length)
                                
                                const currentEmails = emails
                                const combinedEmails = [...currentEmails, ...filteredEmails]
                                
                                emailStore.setEmails(currentSection, combinedEmails, {
                                  source: 'gmail',
                                  cached: currentEmails.length,
                                  newlyFetched: filteredEmails.length,
                                  lastFetched: new Date().toISOString()
                                })
                                
                                toast({
                                  title: 'Success',
                                  description: 'Loaded ' + filteredEmails.length + ' emails from ' + olderEmailsRange + '-' + (olderEmailsRange + 30) + ' days ago'
                                })
                                
                                // Update the range for next click
                                setOlderEmailsRange(olderEmailsRange + 30)
                              } catch (error) {
                                toast({
                                  title: 'Error',
                                  description: 'Failed to load older emails',
                                  variant: 'destructive'
                                })
                              }
                            }}
                            disabled={isLoading}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                          >
                            {isLoading ? (
                              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Calendar className="h-4 w-4 mr-2" />
                            )}
                            View older emails ({olderEmailsRange}-{olderEmailsRange + 30} days)
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* Compose Modal */}
      {isComposing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-card rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col"
          >
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h2 className="text-lg font-semibold">Compose Email</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsComposing(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="flex-1 p-4 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">To</label>
                  <Input
                    placeholder="recipient@example.com"
                    value={composeData.to}
                    onChange={(e) => setComposeData(prev => ({ ...prev, to: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Subject</label>
                  <Input
                    placeholder="Email subject"
                    value={composeData.subject}
                    onChange={(e) => setComposeData(prev => ({ ...prev, subject: e.target.value }))}
                  />
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium mb-2 block">Message</label>
                <AdvancedRichTextEditor
                  value={composeData.body}
                  onChange={(value) => {
                    setComposeData(prev => ({ ...prev, body: value }))
                    handleAutoSave({ body: value })
                  }}
                  placeholder="Write your email..."
                />
              </div>
              
              {/* Schedule Options */}
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="schedule"
                    checked={isScheduled}
                    onChange={(e) => setIsScheduled(e.target.checked)}
                    className="rounded"
                  />
                  <label htmlFor="schedule" className="text-sm font-medium">
                    Schedule for later
                  </label>
                </div>
                
                {isScheduled && (
                  <div className="flex items-center space-x-2">
                    <Input
                      type="date"
                      value={scheduledDate.toISOString().split('T')[0]}
                      onChange={(e) => setScheduledDate(new Date(e.target.value))}
                      className="w-auto"
                    />
                    <div className="flex items-center space-x-1">
                       <Input
                         type="number"
                         min="0"
                         max="23"
                         value={scheduledTime.hours}
                         onChange={(e) => setScheduledTime(prev => ({ ...prev, hours: parseInt(e.target.value) || 0 }))}
                         className="w-16"
                         placeholder="HH"
                       />
                       <span>:</span>
                       <Input
                         type="number"
                         min="0"
                         max="59"
                         value={scheduledTime.minutes}
                         onChange={(e) => setScheduledTime(prev => ({ ...prev, minutes: parseInt(e.target.value) || 0 }))}
                         className="w-16"
                         placeholder="MM"
                       />
                     </div>
                  </div>
                )}
              </div>
              
              {/* Attachments */}
              {composeAttachments.length > 0 && (
                <div>
                  <label className="text-sm font-medium mb-2 block">Attachments</label>
                  <div className="space-y-2">
                    {composeAttachments.map((attachment) => (
                      <div key={attachment.id} className="flex items-center justify-between p-2 bg-muted rounded">
                        <div className="flex items-center space-x-2">
                          <Paperclip className="h-4 w-4" />
                          <span className="text-sm">{attachment.name}</span>
                          <span className="text-xs text-muted-foreground">
                            ({(attachment.size / 1024).toFixed(1)} KB)
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveAttachment(attachment.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-border flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const input = document.createElement('input')
                    input.type = 'file'
                    input.multiple = true
                    input.onchange = (e) => {
                      const files = Array.from((e.target as HTMLInputElement).files || [])
                      const newAttachments = files.map(file => ({
                        id: Math.random().toString(36).substr(2, 9),
                        name: file.name,
                        size: file.size,
                        type: file.type,
                        file
                      }))
                      setComposeAttachments(prev => [...prev, ...newAttachments])
                    }
                    input.click()
                  }}
                >
                  <Paperclip className="h-4 w-4 mr-2" />
                  Attach Files
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAIAssistant(true)}
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  AI Assist
                </Button>
              </div>
              
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  onClick={() => setIsComposing(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSendEmail}
                  disabled={isSending || !composeData.to || !composeData.subject}
                >
                  {isSending ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  {isScheduled ? 'Schedule' : 'Send'}
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
      
      {/* AI Assistant */}
       {showAIAssistant && (
         <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
           <div className="bg-card rounded-lg w-full max-w-4xl h-[80vh] mx-4 flex flex-col">
             <div className="flex items-center justify-between p-4 border-b border-border">
               <h3 className="text-lg font-semibold">AI Assistant</h3>
               <Button variant="ghost" size="sm" onClick={() => setShowAIAssistant(false)}>
                 <X className="h-4 w-4" />
               </Button>
             </div>
             <div className="flex-1 overflow-hidden">
               <AIAssistant />
             </div>
           </div>
         </div>
       )}
       
       {/* Contacts */}
       {showContacts && (
         <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
           <div className="bg-card rounded-lg p-6 max-w-md w-full mx-4">
             <div className="flex items-center justify-between mb-4">
               <h3 className="text-lg font-semibold">Contacts</h3>
               <Button variant="ghost" size="sm" onClick={() => setShowContacts(false)}>
                 <X className="h-4 w-4" />
               </Button>
             </div>
             <p className="text-muted-foreground">Contacts functionality coming soon...</p>
           </div>
         </div>
       )}
    </div>
  )
}