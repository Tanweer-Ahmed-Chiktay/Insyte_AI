'use client'

import { useState, useEffect } from 'react'
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
import { AccountSwitcher } from '@/components/account-switcher'
import { startEmailScheduler } from '@/lib/scheduler'
import DOMPurify from 'dompurify'
import { useEmailCache, useEmailPersistence, usePrefetchEmails } from '@/hooks/use-email-cache'
import useEmailStore from '@/lib/email-store'
import { useWebSocketUnified } from '@/hooks/use-websocket-unified'
import EmailDashboardWithPanes from './email-dashboard-with-panes'
import { 
  EmailListSkeleton, 
  EmailDetailSkeleton, 
  EmailSidebarSkeleton,
  EmailStatsCardSkeleton 
} from '@/components/ui/skeleton-loader'
import { VirtualEmailList } from '@/components/virtual-email-list'
import { createCSRFHeaders } from '@/lib/utils/csrf-client'

// Cache utility functions
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
    console.error('Failed to save to cache:', error)
  }
}

const loadFromCache = (key: string, maxAge?: number) => {
  try {
    const cached = localStorage.getItem(key)
    if (!cached) return null
    
    const { data, timestamp } = JSON.parse(cached)
    
    // Check if cache is expired
    if (maxAge && Date.now() - timestamp > maxAge) {
      localStorage.removeItem(key)
      return null
    }
    
    return data
  } catch (error) {
    console.error('Failed to load from cache:', error)
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
  summary?: EmailSummary | null
}

interface FullEmail extends Email {
  to: string
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

// Safe HTML renderer component
function SafeHTMLRenderer({ htmlContent }: { htmlContent: string }) {
  const sanitizedHTML = DOMPurify.sanitize(htmlContent, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'a', 'img', 'div', 'span', 'table', 'tr', 'td', 'th', 'tbody', 'thead', 'blockquote'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'style', 'class', 'target'],
    ALLOW_DATA_ATTR: false
  })
  
  return (
    <div className="w-full max-w-none overflow-hidden">
      <div 
        className="prose prose-sm max-w-none dark:prose-invert prose-headings:text-foreground prose-p:text-foreground prose-strong:text-foreground prose-em:text-foreground prose-li:text-foreground prose-blockquote:text-foreground prose-a:text-primary hover:prose-a:text-primary/80 prose-img:max-w-full prose-img:h-auto prose-table:text-foreground break-words"
        dangerouslySetInnerHTML={{ __html: sanitizedHTML }}
      />
    </div>
  )
}

export function EmailDashboard() {
  return <EmailDashboardWithPanes />
}

// Keep the original for reference
export function EmailDashboardOriginal() {
  const { data: session } = useSession()
  const { toast } = useToast()
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null)
  const [fullEmailContent, setFullEmailContent] = useState<FullEmail | null>(null)
  const [emailSummary, setEmailSummary] = useState<EmailSummary | null>(null)
  const [isLoadingFullEmail, setIsLoadingFullEmail] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentSection, setCurrentSection] = useState('inbox')
  const [isComposing, setIsComposing] = useState(false)
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [composeData, setComposeData] = useState({
    to: '',
    subject: '',
    body: ''
  })
  const [isScheduled, setIsScheduled] = useState(false)
  const [scheduledDate, setScheduledDate] = useState(new Date())
  const [scheduledTime, setScheduledTime] = useState({
    hours: new Date().getHours(),
    minutes: new Date().getMinutes()
  })
  const [showSchedulePicker, setShowSchedulePicker] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [composeAttachments, setComposeAttachments] = useState<Array<{
    id: string
    file: File
    name: string
    size: number
    type: string
  }>>([])
  const [isSending, setIsSending] = useState(false)
  const [isMobilePreviewOpen, setIsMobilePreviewOpen] = useState(false)
  const [generatingSummaries, setGeneratingSummaries] = useState<Set<string>>(new Set())

  // WebSocket connection for real-time updates
  const { isConnected } = useWebSocketUnified()

  // Use SWR-based email caching
  const { 
    emails, 
    cacheInfo, 
    isLoading, 
    isValidating, 
    error, 
    refresh, 
    backgroundSync,
    loadOlderEmails,
    hasMore,
    nextOlderThan
  } = useEmailCache({ 
    category: currentSection, 
    revalidateOnFocus: false,
    maxAgeMinutes: 5,
    enablePrefetch: true
  })

  // Use localStorage persistence
  useEmailPersistence()

  // Use prefetch hook for background loading
  const { prefetch } = usePrefetchEmails()

  // Get email store for additional functionality
  const emailStore = useEmailStore()

  const isRefreshing = isValidating

  // Function to clear email cache
  const clearEmailCache = () => {
    localStorage.removeItem(CACHE_KEYS.EMAILS)
    localStorage.removeItem(CACHE_KEYS.EMAIL_SUMMARIES)
    localStorage.removeItem(CACHE_KEYS.LAST_EMAIL_FETCH)
    emailStore.clearAll()
    toast({
      title: 'Cache Cleared',
      description: 'Email cache has been cleared. Refreshing emails...'
    })
    refresh(true) // Force refresh with SWR
  }

  useEffect(() => {
    if (session) {
      // Note: Email scheduler is auto-started in scheduler.ts
      
      // Background sync on login
      backgroundSync()
      
      // Prefetch other categories
       const categories = ['sent', 'starred', 'important']
       categories.forEach(category => {
         if (category !== currentSection) {
           prefetch([category])
         }
       })
    }
  }, [session, backgroundSync, prefetch, currentSection])

  // WebSocket connection is now handled by the useWebSocket hook above
  // Real-time notifications will be processed automatically

  // SWR handles email loading automatically

  const handleRefresh = () => {
    refresh(true) // Force refresh from Gmail with SWR
  }

  // Function to generate summaries for emails that don't have them
  const generateMissingSummaries = async (emails: Email[]) => {
    const emailsWithoutSummaries = emails.filter(email => !email.summary)
    
    if (emailsWithoutSummaries.length === 0) {
      return
    }

    console.log(`Generating summaries for ${emailsWithoutSummaries.length} emails without summaries`)
    
    // Mark emails as having summaries being generated
    const emailIds = emailsWithoutSummaries.map(email => email.id)
    setGeneratingSummaries(prev => new Set([...Array.from(prev), ...emailIds]))
    
    // Process emails in small batches to avoid overwhelming the API
    const batchSize = 2
    for (let i = 0; i < emailsWithoutSummaries.length; i += batchSize) {
      const batch = emailsWithoutSummaries.slice(i, i + batchSize)
      
      // Process batch with delays
      await Promise.all(
        batch.map(async (email, index) => {
          try {
            // Add delay between requests
            await new Promise(resolve => setTimeout(resolve, index * 2000))
            
            const headers = await createCSRFHeaders()
            const response = await fetch('/api/ai/summarize', {
              method: 'POST',
              headers,
              body: JSON.stringify({
                emailId: email.id
              })
            })
            
            if (response.ok) {
              const data = await response.json()
              
              // Update the email in the list to include the summary
              const updatedEmail = emails.find(e => e.id === email.id)
              if (updatedEmail) {
                emailStore.updateEmail(email.id, { ...updatedEmail, summary: data.summary })
              }
              
              // Cache the summary
              const existingSummaries = loadFromCache(CACHE_KEYS.EMAIL_SUMMARIES) || {}
              existingSummaries[email.id] = data.summary
              saveToCache(CACHE_KEYS.EMAIL_SUMMARIES, existingSummaries)
              
              console.log(`Generated summary for email: ${email.subject.substring(0, 30)}...`)
            } else if (response.status !== 401) {
              console.error(`Failed to generate summary for email ${email.id}:`, response.status)
            }
          } catch (error) {
            console.error(`Error generating summary for email ${email.id}:`, error)
          } finally {
            // Remove from generating set
            setGeneratingSummaries(prev => {
              const newSet = new Set(prev)
              newSet.delete(email.id)
              return newSet
            })
          }
        })
      )
      
      // Delay between batches
      if (i + batchSize < emailsWithoutSummaries.length) {
        await new Promise(resolve => setTimeout(resolve, 3000))
      }
    }
  }

  const fetchFullEmailContent = async (emailId: string): Promise<FullEmail | null> => {
    // Check cache first
    const cacheKey = `full_email_${emailId}`
    const cachedEmail = loadFromCache(cacheKey, 60 * 60 * 1000) // 1 hour cache
    if (cachedEmail) {
      return cachedEmail
    }

    try {
      setIsLoadingFullEmail(true)
      const response = await fetch(`/api/emails/${emailId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })
      
      if (response.ok) {
        const fullEmail = await response.json()
        // Cache the full email content
        saveToCache(cacheKey, fullEmail)
        return fullEmail
      } else {
        if (response.status === 401) {
          console.error('Authentication expired when fetching email content')
          toast({
            title: 'Authentication Required',
            description: 'Your session has expired. Please sign in again.',
            variant: 'destructive'
          })
          // Redirect to sign in after a short delay
          setTimeout(() => {
            window.location.href = '/api/auth/signin'
          }, 2000)
        } else if (response.status === 404) {
          console.error('Email not found')
          toast({
            title: 'Error',
            description: 'Email not found',
            variant: 'destructive'
          })
        } else {
          console.error(`Failed to fetch full email content (${response.status})`)
          toast({
            title: 'Error',
            description: `Failed to fetch email content (${response.status})`,
            variant: 'destructive'
          })
        }
        return null
      }
    } catch (error) {
      console.error('Error fetching full email content:', error)
      toast({
        title: 'Error',
        description: 'Failed to load email content. Please try again.',
        variant: 'destructive'
      })
      return null
    } finally {
      setIsLoadingFullEmail(false)
    }
  }

  const handleEmailSelect = async (email: Email) => {
    setSelectedEmail(email)
    setEmailSummary(null)
    setFullEmailContent(null)
    setIsMobilePreviewOpen(true) // Open mobile preview when email is selected
    
    if (!email.isRead) {
      const updatedEmail = emails.find(e => e.id === email.id)
      if (updatedEmail) {
        emailStore.updateEmail(email.id, { ...updatedEmail, isRead: true })
      }
    }

    // Use existing summary from email object if available
    if (email.summary) {
      setEmailSummary(email.summary)
    } else {
      // Check for cached email summary
      const cachedSummaries = loadFromCache(CACHE_KEYS.EMAIL_SUMMARIES, 24 * 60 * 60 * 1000) // 24 hours
      if (cachedSummaries && cachedSummaries[email.id]) {
        setEmailSummary(cachedSummaries[email.id])
      }
    }

    // Fetch full email content
    const fullEmail = await fetchFullEmailContent(email.id)
    if (fullEmail) {
      setFullEmailContent(fullEmail)
    }
    
    // Generate AI summary only if not already available
    if (!email.summary && (!loadFromCache(CACHE_KEYS.EMAIL_SUMMARIES)?.[email.id])) {
      try {
        const headers = await createCSRFHeaders()
        const response = await fetch('/api/ai/summarize', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            emailId: email.id
          })
        })
        
        if (response.ok) {
          const data = await response.json()
          setEmailSummary(data.summary)
          
          // Cache the summary
          const existingSummaries = loadFromCache(CACHE_KEYS.EMAIL_SUMMARIES) || {}
          existingSummaries[email.id] = data.summary
          saveToCache(CACHE_KEYS.EMAIL_SUMMARIES, existingSummaries)
          
          // Update the email in the list to include the summary
          const updatedEmail = emails.find(e => e.id === email.id)
          if (updatedEmail) {
            emailStore.updateEmail(email.id, { ...updatedEmail, summary: data.summary })
          }
        } else if (response.status === 401) {
          console.warn('Authentication required for AI summary. Please check your login status.')
          // Don't show error to user, just skip AI summary
        } else {
          console.error('Failed to generate summary:', response.status, response.statusText)
        }
      } catch (error) {
        console.error('Failed to generate email summary:', error)
      }
    }
  }

  const handleBackToEmailList = () => {
    setIsMobilePreviewOpen(false)
    setSelectedEmail(null)
    setEmailSummary(null)
    setFullEmailContent(null)
  }

  const toggleStar = (emailId: string) => {
    const updatedEmail = emails.find(e => e.id === emailId)
    if (updatedEmail) {
      emailStore.updateEmail(emailId, { ...updatedEmail, isStarred: !updatedEmail.isStarred })
    }
  }

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  const handleRemoveAttachment = (id: string) => {
    setComposeAttachments(prev => prev.filter(attachment => attachment.id !== id))
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    
    const files = Array.from(e.dataTransfer.files)
    files.forEach(file => {
      const attachment = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        file,
        name: file.name,
        size: file.size,
        type: file.type
      }
      setComposeAttachments(prev => [...prev, attachment])
    })
  }

  const handleImageDrop = (file: File) => {
    // Handle inline image insertion in rich text editor
    const reader = new FileReader()
    reader.onload = (e) => {
      const imageUrl = e.target?.result as string
      // This would need to be integrated with the RichTextEditor component
      // For now, we'll add it as an attachment
      const attachment = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        file,
        name: file.name,
        size: file.size,
        type: file.type
      }
      setComposeAttachments(prev => [...prev, attachment])
    }
    reader.readAsDataURL(file)
  }



  const CalendarPicker = () => {
    const today = new Date()
    const currentMonth = scheduledDate.getMonth()
    const currentYear = scheduledDate.getFullYear()
    const firstDay = new Date(currentYear, currentMonth, 1)
    const lastDay = new Date(currentYear, currentMonth + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startingDayOfWeek = firstDay.getDay()

    const days = []
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null)
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i)
    }

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ]

    const navigateMonth = (direction: number) => {
      const newDate = new Date(scheduledDate)
      newDate.setMonth(currentMonth + direction)
      setScheduledDate(newDate)
    }

    const selectDate = (day: number) => {
      const newDate = new Date(currentYear, currentMonth, day)
      setScheduledDate(newDate)
    }

    return (
      <div className="w-72 bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => navigateMonth(-1)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors duration-200"
          >
            <ChevronLeft className="h-5 w-5 text-gray-600" />
          </button>
          <div className="font-semibold text-lg text-gray-800">
            {monthNames[currentMonth]} {currentYear}
          </div>
          <button
            onClick={() => navigateMonth(1)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors duration-200"
          >
            <ChevronRight className="h-5 w-5 text-gray-600" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-sm mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="p-3 font-semibold text-gray-700 text-xs uppercase tracking-wide">{day}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {days.map((day, index) => {
            if (day === null) {
              return <div key={index} className="p-3"></div>
            }
            const isToday = day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear()
            const isSelected = day === scheduledDate.getDate() && currentMonth === scheduledDate.getMonth() && currentYear === scheduledDate.getFullYear()
            const isPast = new Date(currentYear, currentMonth, day) < new Date(today.getFullYear(), today.getMonth(), today.getDate())
            
            return (
              <button
                key={index}
                onClick={() => !isPast && selectDate(day)}
                disabled={isPast}
                className={cn(
                  'p-3 rounded-lg text-sm font-medium transition-all duration-200 relative',
                  'hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1',
                  isSelected && 'bg-blue-600 text-white hover:bg-blue-700 shadow-md',
                  isToday && !isSelected && 'bg-blue-50 text-blue-600 border-2 border-blue-200',
                  isPast && 'text-gray-300 cursor-not-allowed hover:bg-transparent',
                  !isPast && !isSelected && !isToday && 'text-gray-700 hover:text-gray-900'
                )}
              >
                {day}
                {isToday && !isSelected && (
                  <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-blue-600 rounded-full"></div>
                )}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const handleAutoSave = async () => {
    // Only auto-save if there's content and a recipient
    if (!composeData.body.trim() && !composeData.to.trim() && !composeData.subject.trim()) {
      return
    }

    try {
      const response = await fetch('/api/drafts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: composeData.to,
          subject: composeData.subject || '(No Subject)',
          body: composeData.body,
          attachments: composeAttachments.map(att => ({
            filename: att.name,
            mimeType: att.type,
            size: att.size
          }))
        }),
      })

      if (!response.ok) {
        console.error('Failed to auto-save draft')
      }
    } catch (error) {
      console.error('Error auto-saving draft:', error)
    }
  }

  const handleSendEmail = async () => {
    // Validate recipient email
    if (!composeData.to || !validateEmail(composeData.to)) {
      toast({
        title: 'Error',
        description: 'Please enter a valid email address',
        variant: 'destructive',
      })
      return
    }

    // Check if there's content or attachments
    const hasContent = composeData.body.trim().length > 0
    const hasAttachments = composeAttachments.length > 0
    
    if (!hasContent && !hasAttachments) {
      toast({
        title: 'Error',
        description: 'Please add content or attachments to send',
        variant: 'destructive',
      })
      return
    }

    // Check scheduled date is not in the past
    if (isScheduled) {
      const scheduledDateTime = new Date(scheduledDate)
      scheduledDateTime.setHours(scheduledTime.hours, scheduledTime.minutes, 0, 0)
      
      if (scheduledDateTime <= new Date()) {
        toast({
          title: 'Error',
          description: 'Scheduled time cannot be in the past',
          variant: 'destructive',
        })
        return
      }
    }

    setIsSending(true)
    try {
      // Prepare form data for attachments
      const formData = new FormData()
      formData.append('to', composeData.to)
      
      // Default subject to "(No Subject)" if blank but has content/attachments
      const subject = composeData.subject.trim() || '(No Subject)'
      formData.append('subject', subject)
      formData.append('htmlBody', composeData.body)
      
      if (isScheduled) {
        const scheduledDateTime = new Date(scheduledDate)
        scheduledDateTime.setHours(scheduledTime.hours, scheduledTime.minutes, 0, 0)
        formData.append('scheduledAt', scheduledDateTime.toISOString())
      }
      
      // Add attachments
      composeAttachments.forEach((attachment, index) => {
        formData.append(`attachment_${index}`, attachment.file)
      })
      formData.append('attachmentCount', composeAttachments.length.toString())

      const response = await fetch('/api/send-email', {
        method: 'POST',
        body: formData,
      })

      if (response.ok) {
        toast({
          title: 'Success',
          description: isScheduled ? 'Email scheduled successfully!' : 'Email sent successfully!',
        })
        setIsComposing(false)
        setComposeData({ to: '', subject: '', body: '' })
        setComposeAttachments([])
        setIsScheduled(false)
        setShowSchedulePicker(false)
      } else {
        throw new Error('Failed to send email')
      }
    } catch (error) {
      console.error('Error sending email:', error)
      toast({
        title: 'Error',
        description: 'Failed to send email. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsSending(false)
    }
  }

  const filteredEmails = emails.filter(email => {
    // Filter by search query only, since backend handles categorization
    const matchesSearch = !searchQuery || 
      email.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      email.from.toLowerCase().includes(searchQuery.toLowerCase()) ||
      email.snippet.toLowerCase().includes(searchQuery.toLowerCase())
    
    return matchesSearch
  })

  const sidebarItems = [
    { id: 'inbox', label: 'Inbox', icon: Mail, count: emails.filter(e => !e.isRead).length },
    { id: 'starred', label: 'Starred', icon: Star, count: emails.filter(e => e.isStarred).length },
    { id: 'important', label: 'Important', icon: Sparkles, count: emails.filter(e => e.isImportant).length },
    { id: 'sent', label: 'Sent', icon: Send, count: 0 },
    { id: 'promotions', label: 'Promotions', icon: Tag, count: 0 },
    { id: 'social', label: 'Social', icon: Users, count: 0 },
    { id: 'archive', label: 'Archive', icon: Archive, count: 0 },
    { id: 'trash', label: 'Trash', icon: Trash2, count: 0 },
    { id: 'contacts', label: 'Contacts', icon: Users, count: 0 },
    { id: 'ai-assistant', label: 'AI Assistant', icon: Bot, count: 0 },
  ]

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      {/* Sidebar */}
      <AnimatePresence>
        {(isSidebarOpen || (typeof window !== 'undefined' && window.innerWidth >= 768)) && (
          <motion.aside
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            transition={{ type: 'spring', damping: 20 }}
            className="w-64 bg-card border-r border-border flex flex-col fixed md:relative z-50 h-full"
          >
            <div className="p-3 border-b border-border flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsSidebarOpen(false)}
                    className="h-8 w-8"
                  >
                    <Menu className="h-4 w-4" />
                  </Button>
                  <h1 className="text-lg font-bold text-primary">InSyte AI</h1>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsSidebarOpen(false)}
                  className="md:hidden h-8 w-8"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="p-3 flex-shrink-0">
              <Button 
                onClick={() => setIsComposing(true)}
                className="w-full h-9 text-sm"
              >
                <Plus className="mr-2 h-4 w-4" />
                Compose
              </Button>
            </div>

            <nav className="flex-1 px-3 overflow-y-auto">
              <ul className="space-y-2">
                {sidebarItems.map((item) => {
                  const Icon = item.icon
                  return (
                    <li key={item.id}>
                      <Button
                        variant={currentSection === item.id ? 'secondary' : 'ghost'}
                        className="w-full justify-start h-9 text-sm"
                        onClick={() => {
                          setCurrentSection(item.id)
                          setSelectedEmail(null)
                          setIsSidebarOpen(false)
                          // Refresh emails for the new category
                          refresh(true)
                        }}
                      >
                        <Icon className="mr-2 h-4 w-4 flex-shrink-0" />
                        <span className="truncate">{item.label}</span>
                        {item.count > 0 && (
                          <span className="ml-auto bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 text-xs flex-shrink-0">
                            {item.count}
                          </span>
                        )}
                      </Button>
                    </li>
                  )
                })}
              </ul>
            </nav>

            <div className="p-3 border-t border-border flex-shrink-0">
              <div className="flex items-center space-x-2 mb-3">
                <div className="w-7 h-7 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-primary-foreground text-xs font-medium">
                    {session?.user?.name?.charAt(0) || 'U'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">
                    {session?.user?.name || 'User'}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {session?.user?.email}
                  </p>
                </div>
              </div>
              <AccountSwitcher />
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Header */}
        <header className="bg-card border-b border-border p-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsSidebarOpen(true)}
                className="md:hidden h-8 w-8 p-0"
              >
                <Menu className="h-4 w-4" />
              </Button>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search emails..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-8 w-48 sm:w-64 text-sm"
                />
              </div>
            </div>
            <div className="flex items-center space-x-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="h-8 w-8 p-0"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsListening(!isListening)}
                className={cn("h-8 w-8 p-0", isListening && 'bg-red-100 text-red-600')}
              >
                {isListening ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
              </Button>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <Settings className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 flex min-h-0">
          {currentSection === 'ai-assistant' ? (
            <AIAssistant />
          ) : currentSection === 'contacts' ? (
            <div className="flex-1 p-6 overflow-y-auto">
              <ContactsTab onSendEmailToContact={(contactEmail, contactName) => {
                // Open compose modal with contact pre-filled
                setIsComposing(true)
                setComposeData(prev => ({ ...prev, to: contactEmail }))
                toast({
                  title: 'Compose Email',
                  description: `Ready to compose email to ${contactName}`,
                })
              }} />
            </div>
          ) : (
            <>
              {/* Email List */}
              <div className={cn(
                "border-r border-border flex flex-col",
                "w-full md:w-1/3", // Full width on mobile, 1/3 on desktop
                isMobilePreviewOpen && "hidden md:flex" // Hide on mobile when preview is open
              )}>
                <div className="p-3 border-b border-border flex-shrink-0">
                  <h2 className="text-sm font-semibold capitalize">{currentSection}</h2>
                  <p className="text-xs text-muted-foreground">{filteredEmails.length} emails</p>
                </div>
                <div className="flex-1 overflow-y-auto">
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
                      <Button onClick={handleRefresh} variant="outline">
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Refresh
                      </Button>
                    </div>
                  ) : (
                    <>
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
                            const originalEmail = filteredEmails.find(e => e.id === email.id)
                            if (originalEmail) {
                              handleEmailSelect(originalEmail)
                            }
                          }}
                          selectedEmailId={selectedEmail?.id}
                        />
                      </div>
                      
                      {/* Load More Button */}
                      {hasMore && nextOlderThan && (
                        <div className="p-4 border-t border-border">
                          <Button
                            variant="outline"
                            className="w-full"
                            onClick={async () => {
                              try {
                                await loadOlderEmails(nextOlderThan)
                                toast({
                                  title: "Older emails loaded",
                                  description: "Successfully loaded more emails",
                                  duration: 2000
                                })
                              } catch (error) {
                                toast({
                                  title: "Failed to load older emails",
                                  description: "Please try again",
                                  variant: "destructive",
                                  duration: 3000
                                })
                              }
                            }}
                            disabled={isLoading}
                          >
                            {isLoading ? (
                              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <ChevronRight className="h-4 w-4 mr-2" />
                            )}
                            Load older emails (30 days)
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Email Detail */}
              <div className={cn(
                "flex flex-col min-h-0",
                "w-full md:flex-1", // Full width on mobile, flex-1 on desktop
                !isMobilePreviewOpen && "hidden md:flex" // Hide on mobile when preview is closed
              )}>
                {selectedEmail ? (
                  <>
                    <div className="p-4 md:p-6 border-b border-border flex-shrink-0">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1 min-w-0">
                          {/* Mobile back button */}
                          <div className="flex items-center mb-3 md:hidden">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={handleBackToEmailList}
                              className="mr-2 p-1"
                            >
                              <ArrowLeft className="h-4 w-4" />
                            </Button>
                            <span className="text-sm text-muted-foreground">Back to emails</span>
                          </div>
                          <h1 className="text-lg md:text-xl font-semibold mb-2 break-words">{selectedEmail.subject}</h1>
                          <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 space-y-1 sm:space-y-0 text-sm text-muted-foreground">
                            <span className="break-words">From: {selectedEmail.from}</span>
                            <span>{new Date(selectedEmail.receivedAt).toLocaleString()}</span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2 ml-2 flex-shrink-0">
                          <Button variant="outline" size="sm" className="hidden sm:inline-flex">
                            Reply
                          </Button>
                          <Button variant="outline" size="sm" className="hidden sm:inline-flex">
                            Forward
                          </Button>
                          <Button variant="outline" size="sm">
                            <Archive className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 p-4 md:p-6 overflow-y-auto">
                      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-6 max-w-full">
                        <div className="xl:col-span-2 space-y-4 min-w-0">
                          <Card className="overflow-hidden">
                            <CardHeader className="pb-3">
                              <CardTitle className="flex items-center flex-wrap gap-2">
                                <Mail className="mr-2 h-5 w-5 flex-shrink-0" />
                                <span className="flex-1 min-w-0">Email Content</span>
                                {fullEmailContent?.to && (
                                  <span className="text-sm font-normal text-muted-foreground truncate max-w-xs">
                                    To: {fullEmailContent.to}
                                  </span>
                                )}
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-0">
                              {isLoadingFullEmail ? (
                                <div className="flex items-center justify-center py-12">
                                  <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                                  <span className="text-muted-foreground">Loading full email content...</span>
                                </div>
                              ) : fullEmailContent?.htmlBody ? (
                                <div className="border rounded-lg p-4 md:p-6 bg-card text-card-foreground overflow-hidden">
                                  <SafeHTMLRenderer htmlContent={fullEmailContent.htmlBody} />
                                </div>
                              ) : fullEmailContent?.textBody ? (
                                <div className="border rounded-lg p-4 md:p-6 bg-muted/30 dark:bg-muted/20 overflow-hidden">
                                  <pre className="text-sm leading-relaxed whitespace-pre-wrap font-sans text-foreground break-words overflow-wrap-anywhere">
                                    {fullEmailContent.textBody}
                                  </pre>
                                </div>
                              ) : (
                                <div className="border rounded-lg p-4 md:p-6 bg-muted/30 dark:bg-muted/20">
                                  <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground break-words">
                                    {selectedEmail.snippet || 'No content preview available.'}
                                  </p>
                                </div>
                              )}
                            </CardContent>
                          </Card>

                          {fullEmailContent?.attachments && fullEmailContent.attachments.length > 0 && (
                            <Card className="overflow-hidden">
                              <CardHeader className="pb-3">
                                <CardTitle className="flex items-center">
                                  <Paperclip className="mr-2 h-5 w-5 flex-shrink-0" />
                                  Attachments ({fullEmailContent.attachments.length})
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="pt-0">
                                <div className="space-y-3">
                                  {fullEmailContent.attachments.map((attachment, index) => (
                                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors gap-3">
                                      <div className="flex items-center space-x-3 min-w-0 flex-1">
                                        <Paperclip className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                        <div className="min-w-0 flex-1">
                                          <p className="text-sm font-medium text-foreground truncate">{attachment.filename}</p>
                                          <p className="text-xs text-muted-foreground">
                                            {attachment.mimeType} • {(attachment.size / 1024).toFixed(1)} KB
                                          </p>
                                        </div>
                                      </div>
                                      <Button variant="outline" size="sm" className="flex-shrink-0">
                                        <Download className="h-4 w-4 mr-2" />
                                        <span className="hidden sm:inline">Download</span>
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              </CardContent>
                            </Card>
                          )}
                        </div>

                        <div className="space-y-4">
                          {emailSummary && (
                            <Card className="overflow-hidden">
                              <CardHeader className="pb-3">
                                <CardTitle className="flex items-center">
                                  <Sparkles className="mr-2 h-5 w-5 flex-shrink-0" />
                                  AI Summary
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="space-y-4 pt-0">
                                <div>
                                  <h4 className="font-medium mb-2 text-foreground">Summary</h4>
                                  <p className="text-sm text-muted-foreground leading-relaxed">
                                    {emailSummary.summary}
                                  </p>
                                </div>

                                <div>
                                  <h4 className="font-medium mb-2 text-foreground">Key Points</h4>
                                  <ul className="text-sm text-muted-foreground space-y-2">
                                    {emailSummary.keyPoints.map((point, index) => (
                                      <li key={index} className="flex items-start leading-relaxed">
                                        <span className="mr-2 mt-1 flex-shrink-0">•</span>
                                        <span className="break-words">{point}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              </CardContent>
                            </Card>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {/* Mobile Action Buttons */}
                    <div className="md:hidden border-t border-border p-4 flex-shrink-0">
                      <div className="flex space-x-3">
                        <Button className="flex-1">
                          Reply
                        </Button>
                        <Button variant="outline" className="flex-1">
                          Forward
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                      <Mail className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                      <h3 className="text-lg font-medium mb-2">No email selected</h3>
                      <p className="text-muted-foreground">
                        Select an email from the list to view its content and AI summary.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Compose Modal */}
      {isComposing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
              <h2 className="text-lg font-semibold">Compose Email</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsComposing(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div 
              className={`p-4 space-y-4 overflow-y-auto flex-1 transition-colors ${
                isDragOver ? 'bg-blue-50 border-2 border-dashed border-blue-300' : ''
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {isDragOver && (
                <div className="absolute inset-0 flex items-center justify-center bg-blue-50/90 z-10 rounded-lg">
                  <div className="text-center">
                    <Upload className="h-12 w-12 text-blue-500 mx-auto mb-2" />
                    <p className="text-lg font-medium text-blue-700">Drop files here to attach</p>
                    <p className="text-sm text-blue-600">Images dropped in the editor will be inline</p>
                  </div>
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium mb-1">To</label>
                <Input
                  type="email"
                  placeholder="recipient@example.com"
                  value={composeData.to}
                  onChange={(e) => setComposeData({ ...composeData, to: e.target.value })}
                  className={!validateEmail(composeData.to) && composeData.to ? 'border-red-300' : ''}
                />
                {!validateEmail(composeData.to) && composeData.to && (
                  <p className="text-sm text-red-600 mt-1">Please enter a valid email address</p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Subject</label>
                <Input
                  placeholder="Email subject (optional)"
                  value={composeData.subject}
                  onChange={(e) => setComposeData({ ...composeData, subject: e.target.value })}
                />
                {!composeData.subject.trim() && (composeData.body.trim() || composeAttachments.length > 0) && (
                  <p className="text-sm text-gray-600 mt-1">Subject will default to <strong>(No Subject)</strong></p>
                )}
              </div>
              
              {/* Scheduled Send Toggle */}
              <div className="flex items-center space-x-3">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isScheduled}
                    onChange={(e) => setIsScheduled(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm font-medium">Schedule Send</span>
                </label>
                {isScheduled && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowSchedulePicker(!showSchedulePicker)}
                  >
                    <Calendar className="h-4 w-4 mr-2" />
                    {scheduledDate.toLocaleDateString()} at {scheduledTime.hours.toString().padStart(2, '0')}:{scheduledTime.minutes.toString().padStart(2, '0')}
                  </Button>
                )}
              </div>
              
              {/* Schedule Picker */}
              {isScheduled && showSchedulePicker && (
                <div className="border rounded-lg p-4 bg-gray-50">
                  <div className="flex flex-col lg:flex-row gap-6">
                    <CalendarPicker />
                    <div className="flex gap-4">
                      <TimePickerWheel
                        value={scheduledTime.hours}
                        onChange={(hours) => setScheduledTime({ ...scheduledTime, hours })}
                        min={0}
                        max={23}
                        label="Hours"
                      />
                      <TimePickerWheel
                        value={scheduledTime.minutes}
                        onChange={(minutes) => setScheduledTime({ ...scheduledTime, minutes })}
                        min={0}
                        max={59}
                        label="Minutes"
                      />
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowSchedulePicker(false)}
                    >
                      Done
                    </Button>
                  </div>
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium mb-1">Message</label>
                <AdvancedRichTextEditor
                   value={composeData.body}
                   onChange={(value: string) => setComposeData({ ...composeData, body: value })}
                   attachments={composeAttachments}
                   onAttachmentsChange={setComposeAttachments}
                   placeholder="Write your email..."
                   composeData={composeData}
                   onAutoSave={handleAutoSave}
                 />
              </div>
              
              {/* Attachments Display */}
              {composeAttachments.length > 0 && (
                <div className="border rounded-lg p-3">
                  <h4 className="text-sm font-medium mb-2 flex items-center">
                    <Paperclip className="h-4 w-4 mr-2" />
                    Attachments ({composeAttachments.length})
                  </h4>
                  <div className="space-y-2">
                    {composeAttachments.map((attachment) => (
                      <div key={attachment.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                        <div className="flex items-center space-x-2 min-w-0 flex-1">
                          <Paperclip className="h-4 w-4 text-gray-500 flex-shrink-0" />
                          <span className="text-sm truncate">{attachment.name}</span>
                          <span className="text-xs text-gray-500">({(attachment.size / 1024).toFixed(1)} KB)</span>
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
            
            <div className="flex items-center justify-between p-4 border-t border-border flex-shrink-0">
              <div className="text-sm text-gray-600">
                {isDragOver ? 'Drop files to attach' : 'Drag files here or use the attachment button'}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => setIsComposing(false)}
                  disabled={isSending}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSendEmail}
                  disabled={isSending || !validateEmail(composeData.to)}
                >
                  {isSending ? 'Sending...' : (
                    <>
                      {isScheduled ? <Clock className="h-4 w-4 mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                      {isScheduled ? 'Schedule' : 'Send'}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
    </div>
  )
}