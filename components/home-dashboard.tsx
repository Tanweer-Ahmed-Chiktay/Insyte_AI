'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import { AIAssistant } from '@/components/ai-assistant'
import { useEmailCache } from '@/hooks/use-email-cache'
import { createCSRFHeaders, getCSRFToken } from '@/lib/utils/csrf-client'
import {
  Home as HomeIcon,
  Mail,
  Sparkles,
  Tag,
  Calendar as CalendarIcon,
  Reply,
  DollarSign,
  TrendingUp,
  Bot,
  Loader2
} from 'lucide-react'

interface PromoInsight {
  code: string
  savingsText: string
  sourceEmailId: string
  subject: string
}

interface UpcomingEvent {
  id: string
  title: string
  start: string
  end: string
  location?: string
}

export function HomeDashboard() {
  const { toast } = useToast()

  // Pull email data across key categories
  const inboxData = useEmailCache({ category: 'inbox', revalidateOnFocus: false })
  const importantData = useEmailCache({ category: 'important', revalidateOnFocus: false })
  const promotionsData = useEmailCache({ category: 'promotions', revalidateOnFocus: false })

  const inboxEmails = inboxData.emails || []
  const importantEmails = importantData.emails || []
  const promotionsEmails = promotionsData.emails || []

  // Refresh promos when new emails arrive via websocket or list refresh events
  useEffect(() => {
    const onEmailListRefresh = (event: Event) => {
      try {
        const detail = (event as CustomEvent).detail
        const category = detail?.category
        if (category === 'promotions' || category === 'inbox' || category === 'important') {
          promotionsData.refresh?.(true)
        }
      } catch (e) {
        console.log('[HomeDashboard] Failed to process email-list-refresh event', e)
      }
    }
    const onNewEmail = () => {
      promotionsData.refresh?.(true)
    }

    window.addEventListener('email-list-refresh', onEmailListRefresh as EventListener)
    window.addEventListener('new-email-received', onNewEmail as EventListener)

    return () => {
      window.removeEventListener('email-list-refresh', onEmailListRefresh as EventListener)
      window.removeEventListener('new-email-received', onNewEmail as EventListener)
    }
  }, [promotionsData.refresh])

  // Track last visit to compute "new since last check"
  const [lastVisit, setLastVisit] = useState<number>(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('home_last_visit') : null
      return raw ? parseInt(raw, 10) : Date.now() - 24 * 60 * 60 * 1000 // default: 24h ago
    } catch {
      return Date.now() - 24 * 60 * 60 * 1000
    }
  })

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('home_last_visit', Date.now().toString())
      }
    } catch {}
  }, [])

  const newImportant = useMemo(() => {
    return importantEmails.filter(e => {
      const received = new Date(e.receivedAt).getTime()
      return received > lastVisit || !e.isRead || e.isImportant
    })
  }, [importantEmails, lastVisit])

  const newInbox = useMemo(() => {
    return inboxEmails.filter(e => new Date(e.receivedAt).getTime() > lastVisit || !e.isRead)
  }, [inboxEmails, lastVisit])

  const promoInsights: PromoInsight[] = useMemo(() => {
    const insights: PromoInsight[] = []
    // Expanded patterns to catch more real-world phrasing and formats
    const codePatterns: RegExp[] = [
      /\b(?:promo\s*code|discount\s*code|offer\s*code|voucher|coupon)\b[:\s-]*([A-Z0-9][A-Z0-9\-]{3,15})/i,
      /\b(?:use|apply|enter)\s+(?:code\s+)?([A-Z0-9][A-Z0-9\-]{3,15})(?:\s+(?:at|during)\s+checkout)?\b/i,
      /\bcode\b[:\s-]*([A-Z0-9][A-Z0-9\-]{3,15})\b/i,
      // Fallback: code adjacent to savings language (e.g., SAVE20 off)
      /\b([A-Z][A-Z0-9\-]{3,15})\b(?=[^\w]{0,10}(?:off|discount|deal|save))/i
    ]
    const savingsPatterns: RegExp[] = [
      /\b(save\s*(\$\d{1,3}|\d{1,2}%))\b/i,
      /\b((\$\d{1,3})\s*off)\b/i,
      /\b(\d{1,2}%\s*off)\b/i,
      /\b(extra\s*\d{1,2}%\s*off)\b/i,
      /\b(up\s*to\s*\d{1,2}%\s*off)\b/i
    ]

    promotionsEmails.slice(0, 50).forEach(email => {
      const text = `${email.subject || ''} ${email.snippet || ''}`
      let code: string | null = null
      for (const re of codePatterns) {
        const match = text.match(re)
        if (match && match[1]) {
          // Avoid false positives like "zip code"
          const context = text.slice(Math.max(0, (match.index || 0) - 12), (match.index || 0) + (match[0]?.length || 0) + 12)
          if (!/\b(zip|area)\s*code\b/i.test(context)) {
            code = match[1].replace(/[^A-Z0-9\-]/gi, '').toUpperCase()
            if (code.length >= 4 && code.length <= 16) break
          }
        }
      }

      if (code) {
        let savingsText = 'Special offer'
        for (const sr of savingsPatterns) {
          const sm = text.match(sr)
          if (sm) { savingsText = sm[0]; break }
        }
        insights.push({
          code,
          savingsText,
          sourceEmailId: email.id,
          subject: email.subject
        })
      }
    })

    // Deduplicate by email and code
    const seen = new Set<string>()
    const unique = insights.filter(i => {
      const key = `${i.sourceEmailId}:${i.code}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    return unique.slice(0, 5)
  }, [promotionsEmails])

  const upcomingEvents: UpcomingEvent[] = []
  // Optional: Fetch from /api/calendar/events for real data; use light demo here
  const now = Date.now()
  upcomingEvents.push({
    id: 'demo-1',
    title: 'Standup Meeting',
    start: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
    end: new Date(now + 3 * 60 * 60 * 1000).toISOString(),
    location: 'Zoom'
  })
  upcomingEvents.push({
    id: 'demo-2',
    title: 'Client Review',
    start: new Date(now + 26 * 60 * 60 * 1000).toISOString(),
    end: new Date(now + 27 * 60 * 60 * 1000).toISOString(),
    location: 'Conference Room B'
  })

  const copyQuickReply = async (replyText: string) => {
    try {
      await navigator.clipboard.writeText(replyText)
      toast({ title: 'Quick Reply', description: 'Reply copied. Open AI Assistant to send.' })
    } catch {
      toast({ title: 'Copy failed', description: 'Could not copy text', variant: 'destructive' })
    }
  }

  // Thread-aware Quick Reply modal state
  const [isReplying, setIsReplying] = useState(false)
  const [replyToEmail, setReplyToEmail] = useState<{
    id: string
    threadId?: string
    subject: string
    from: string
  } | null>(null)
  const [replyBody, setReplyBody] = useState('')
  const [isSendingReply, setIsSendingReply] = useState(false)

  const extractEmailAddress = (input: string) => {
    const angleMatch = input.match(/<([^>]+)>/)
    if (angleMatch) return angleMatch[1]
    const emailMatch = input.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)
    return emailMatch ? emailMatch[0] : input
  }

  const openQuickReply = (email: { id: string; threadId?: string; subject: string; from: string }) => {
    setReplyToEmail(email)
    setReplyBody("Thanks, received. I'll get back shortly.")
    setIsReplying(true)
  }

  const sendQuickReply = async () => {
    if (!replyToEmail) return
    const toAddress = extractEmailAddress(replyToEmail.from)
    const subject = `Re: ${replyToEmail.subject}`
    const htmlBody = replyBody.trim()
    if (!htmlBody) {
      toast({ title: 'Empty reply', description: 'Please enter a message', variant: 'destructive' })
      return
    }
    setIsSendingReply(true)
    try {
      const formData = new FormData()
      formData.append('to', toAddress)
      formData.append('subject', subject)
      formData.append('htmlBody', htmlBody)
      formData.append('attachmentCount', '0')
      if (replyToEmail.threadId) formData.append('threadId', replyToEmail.threadId)
      formData.append('inReplyTo', replyToEmail.id)
      formData.append('references', replyToEmail.id)
      // Include CSRF header without forcing Content-Type (FormData sets its own)
      const csrfToken = await getCSRFToken().catch(() => null)
      if (!csrfToken) {
        console.warn('[Quick Reply] CSRF token unavailable; attempting request may fail')
      }
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: csrfToken ? { 'x-csrf-token': csrfToken } : undefined,
        body: formData
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as any).error || 'Failed to send reply')
      toast({ title: 'Reply sent', description: `Your reply was sent to ${toAddress}` })
      setIsReplying(false)
      setReplyBody('')
      setReplyToEmail(null)
    } catch (err: any) {
      toast({ title: 'Send failed', description: err.message || 'Could not send reply', variant: 'destructive' })
    } finally {
      setIsSendingReply(false)
    }
  }

  // AI Summary of latest emails
  const [aiSummary, setAiSummary] = useState<string>('')
  const [isSummarizing, setIsSummarizing] = useState<boolean>(false)
  const [quickQuestion, setQuickQuestion] = useState<string>('')
  const [quickAnswer, setQuickAnswer] = useState<string>('')

  const buildSummaryPrompt = () => {
    const latest = [...newImportant, ...newInbox]
      .slice(0, 12)
      .map(e => `• ${e.subject} — from ${e.from}; ${e.snippet}`)
      .join('\n')
    return `Summarize these recent emails into 4–6 concise bullets with clear actions, deadlines, and priorities. End with a single-line suggested plan of action.\n\n${latest}`
  }

  const generateAISummary = async () => {
    try {
      setIsSummarizing(true)
      const headers = await createCSRFHeaders()
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: buildSummaryPrompt(),
          includeVoice: false,
          conversationHistory: []
        })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to generate summary')
      setAiSummary(data.response || '')
    } catch (err: any) {
      toast({ title: 'AI Summary error', description: err.message || 'Unexpected error', variant: 'destructive' })
    } finally {
      setIsSummarizing(false)
    }
  }

  const handleQuickAsk = async () => {
    const q = quickQuestion.trim()
    if (!q) return
    try {
      const headers = await createCSRFHeaders()
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: q,
          includeVoice: false,
          conversationHistory: []
        })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to ask')
      setQuickAnswer(data.response || '')
      setQuickQuestion('')
    } catch (err: any) {
      toast({ title: 'Ask error', description: err.message || 'Unexpected error', variant: 'destructive' })
    }
  }

  useEffect(() => {
    // Generate summary on mount and when email lists change
    generateAISummary()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importantEmails.length, inboxEmails.length])

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <HomeIcon className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-xl font-semibold">Your Briefing</h1>
              <p className="text-sm text-muted-foreground">Snapshot of what matters right now</p>
            </div>
          </div>
          <div className="hidden md:flex items-center space-x-2">
            <Badge variant="secondary">New: {newInbox.length}</Badge>
            <Badge variant="secondary">Important: {newImportant.length}</Badge>
            <Badge variant="secondary">Promos: {promoInsights.length}</Badge>
          </div>
        </div>

        {/* AI Summary */}
        <Card className="rounded-2xl shadow-sm mb-6">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-semibold flex items-center">
              <Bot className="h-4 w-4 mr-2 text-primary" />
              AI Summary
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={generateAISummary} disabled={isSummarizing}>
                {isSummarizing ? (
                  <span className="inline-flex items-center"><Loader2 className="mr-1 h-3 w-3 animate-spin" />Summarizing</span>
                ) : (
                  'Refresh Summary'
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {aiSummary ? (
              <div>
                <ul className="space-y-2">
                  {aiSummary
                    .split('\n')
                    .filter(l => l.trim().length > 0)
                    .map((line, idx) => (
                      <li key={idx} className="flex items-start text-sm">
                        <span className="mt-1 mr-2 h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                        <span className="leading-relaxed break-words">{line.replace(/^[\*•\-\s]+/, '')}</span>
                      </li>
                    ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Generating a brief overview of your latest emails…</p>
            )}
            <div className="flex items-center gap-2">
              <Input
                value={quickQuestion}
                onChange={(e) => setQuickQuestion(e.target.value)}
                placeholder="Ask a follow-up about your inbox (e.g., ‘Any deadlines today?’)"
              />
              <Button size="sm" onClick={handleQuickAsk}>Ask</Button>
            </div>
            {quickAnswer && (
              <div className="text-sm text-muted-foreground">{quickAnswer}</div>
            )}
          </CardContent>
        </Card>

        {/* Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Important Updates */}
          <Card className="rounded-2xl shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base font-semibold flex items-center">
                <Tag className="h-4 w-4 mr-2 text-primary" />
                Important Updates
              </CardTitle>
              <Badge variant="outline">{newImportant.length}</Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              {newImportant.slice(0, 5).map(email => (
                <div key={email.id} className="p-3 rounded-xl border bg-card hover:bg-muted/50 transition-colors">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="max-w-[65%] sm:max-w-[72%] md:max-w-[75%]">
                      <p className="font-medium text-sm truncate break-words">{email.subject}</p>
                      <p className="text-xs text-muted-foreground truncate break-words">From: {email.from}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 px-2 shrink-0 inline-flex items-center w-full sm:w-auto sm:mt-0 mt-2"
                      onClick={() => openQuickReply({ id: email.id, threadId: email.threadId, subject: email.subject, from: email.from })}
                    >
                      <Reply className="h-3.5 w-3.5 mr-1" />
                      Quick Reply
                    </Button>
                  </div>
                </div>
              ))}
              {newImportant.length === 0 && (
                <p className="text-sm text-muted-foreground">No new important messages</p>
              )}
            </CardContent>
          </Card>

          {/* Promo Codes & Savings */}
          <Card className="rounded-2xl shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base font-semibold flex items-center">
                <Sparkles className="h-4 w-4 mr-2 text-primary" />
                Promos You Can Use
              </CardTitle>
              <Badge variant="outline">{promoInsights.length}</Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              {promoInsights.map((p) => (
                <div key={p.sourceEmailId} className="p-3 rounded-xl border bg-card">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{p.subject}</p>
                      <p className="text-xs text-muted-foreground">Code: {p.code}</p>
                    </div>
                    <div className="inline-flex items-center text-xs px-2 py-1 rounded-full bg-muted">
                      <DollarSign className="h-3 w-3 mr-1" />
                      <span>{p.savingsText}</span>
                    </div>
                  </div>
                </div>
              ))}
              {promoInsights.length === 0 && (
                <p className="text-sm text-muted-foreground">No obvious promo codes detected</p>
              )}
            </CardContent>
          </Card>

          {/* Upcoming Calendar */}
          <Card className="rounded-2xl shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base font-semibold flex items-center">
                <CalendarIcon className="h-4 w-4 mr-2 text-primary" />
                Upcoming Events
              </CardTitle>
              <Badge variant="outline">{upcomingEvents.length}</Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              {upcomingEvents.map(ev => (
                <div key={ev.id} className="p-3 rounded-xl border bg-card">
                  <p className="font-medium text-sm">{ev.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(ev.start).toLocaleString()} — {new Date(ev.end).toLocaleTimeString()}
                    {ev.location ? ` · ${ev.location}` : ''}
                  </p>
                </div>
              ))}
              {upcomingEvents.length === 0 && (
                <p className="text-sm text-muted-foreground">No upcoming events found</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Central AI Assistant (compact) */}
        <Card className="rounded-2xl shadow-sm mt-6">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center">
              <Bot className="h-4 w-4 mr-2 text-primary" />
              AI Assistant
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="rounded-2xl overflow-hidden border-t max-h-96">
              <div className="h-full overflow-y-auto">
                <AIAssistant />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Reply Modal */}
        {isReplying && replyToEmail && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-card rounded-xl shadow-lg w-full max-w-xl border">
              <div className="p-4 border-b flex items-center justify-between">
                <h3 className="text-base font-semibold">Reply to {extractEmailAddress(replyToEmail.from)}</h3>
                <Button variant="ghost" size="sm" onClick={() => setIsReplying(false)}>Close</Button>
              </div>
              <div className="p-4 space-y-3">
                <div className="text-sm text-muted-foreground">Subject: <span className="text-foreground font-medium">Re: {replyToEmail.subject}</span></div>
                <Textarea
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  placeholder="Type your reply..."
                  className="min-h-[120px]"
                />
              </div>
              <div className="p-4 border-t flex items-center justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setIsReplying(false)}>Cancel</Button>
                <Button size="sm" onClick={sendQuickReply} disabled={isSendingReply}>
                  {isSendingReply ? <span className="inline-flex items-center"><Loader2 className="mr-1 h-3 w-3 animate-spin" />Sending</span> : 'Send Reply'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default HomeDashboard