'use client'

import React, { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useToast } from '@/components/ui/use-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { HomeDashboard } from '@/components/home-dashboard'
import { useEmailCache } from '@/hooks/use-email-cache'
import { createCSRFHeaders } from '@/lib/utils/csrf-client'
import {
  Mail,
  Search,
  Plus,
  RefreshCw,
  Calendar as CalendarIcon,
  Users,
  Bot,
  Settings
} from 'lucide-react'

export default function SuperHomeDashboard({ onNavigate }: { onNavigate?: (section: string) => void }) {
  const { data: session } = useSession()
  const { toast } = useToast()

  const inboxData = useEmailCache({ category: 'inbox', revalidateOnFocus: false })
  const importantData = useEmailCache({ category: 'important', revalidateOnFocus: false })
  const promotionsData = useEmailCache({ category: 'promotions', revalidateOnFocus: false })

  const inboxCount = inboxData.emails?.length || 0
  const importantCount = importantData.emails?.length || 0
  const promosCount = promotionsData.emails?.length || 0

  const [isComposing, setIsComposing] = useState(false)
  const [composeTo, setComposeTo] = useState('')
  const [composeSubject, setComposeSubject] = useState('')
  const [composeBody, setComposeBody] = useState('')
  const [isSending, setIsSending] = useState(false)

  const handleSync = async () => {
    try {
      const res = await fetch('/api/gmail/sync', { method: 'POST' })
      if (!res.ok) throw new Error(`Sync failed: ${res.status}`)
      toast({ title: 'Sync started', description: 'Emails will update shortly.' })
      inboxData.refresh?.(true)
      importantData.refresh?.(true)
    } catch (e) {
      toast({ title: 'Sync error', description: e instanceof Error ? e.message : 'Unknown error' })
    }
  }

  const sendEmail = async () => {
    if (!composeTo || !composeSubject || !composeBody) {
      toast({ title: 'Missing fields', description: 'Fill To, Subject, and Body.' })
      return
    }
    try {
      setIsSending(true)
      const headers = await createCSRFHeaders()
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ to: composeTo, subject: composeSubject, content: composeBody })
      })
      if (!res.ok) throw new Error(`Send failed: ${res.status}`)
      toast({ title: 'Email sent', description: 'Your message has been delivered.' })
      setIsComposing(false)
      setComposeTo('')
      setComposeSubject('')
      setComposeBody('')
    } catch (e) {
      toast({ title: 'Send error', description: e instanceof Error ? e.message : 'Unknown error' })
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top Bar */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-3">
            <Mail className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-xl font-semibold">Welcome{session?.user?.name ? `, ${session.user.name}` : ''}</h1>
              <p className="text-sm text-muted-foreground">Everything you need at a glance</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input placeholder="Search emails, contacts…" className="pl-10 w-64" />
            </div>
            <Button variant="default" onClick={() => setIsComposing(true)}>
              <Plus className="mr-2 h-4 w-4" /> Compose
            </Button>
            <Button variant="outline" onClick={handleSync}>
              <RefreshCw className="mr-2 h-4 w-4" /> Sync
            </Button>
            <Button variant="ghost">
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card
            className="rounded-xl cursor-pointer hover:bg-muted/40 transition"
            onClick={() => onNavigate?.('inbox')}
            aria-label="Go to Inbox"
          >
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground">Inbox</div>
                <div className="text-2xl font-semibold">{inboxCount}</div>
              </div>
              <Badge variant="secondary">Now</Badge>
            </CardContent>
          </Card>
          <Card
            className="rounded-xl cursor-pointer hover:bg-muted/40 transition"
            onClick={() => onNavigate?.('important')}
            aria-label="Go to Important"
          >
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground">Important</div>
                <div className="text-2xl font-semibold">{importantCount}</div>
              </div>
              <Badge variant="secondary">Focus</Badge>
            </CardContent>
          </Card>
          <Card
            className="rounded-xl cursor-pointer hover:bg-muted/40 transition"
            onClick={() => onNavigate?.('promotions')}
            aria-label="Go to Promotions"
          >
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground">Promotions</div>
                <div className="text-2xl font-semibold">{promosCount}</div>
              </div>
              <Badge variant="secondary">Deals</Badge>
            </CardContent>
          </Card>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <HomeDashboard />
          </div>
          <div className="space-y-6">
            {/* Quick Compose */}
            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center">
                  <Plus className="h-4 w-4 mr-2 text-primary" /> Quick Compose
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input placeholder="To" value={composeTo} onChange={(e) => setComposeTo(e.target.value)} />
                <Input placeholder="Subject" value={composeSubject} onChange={(e) => setComposeSubject(e.target.value)} />
                <Textarea placeholder="Write your message…" value={composeBody} onChange={(e) => setComposeBody(e.target.value)} rows={6} />
                <div className="flex items-center gap-2">
                  <Button onClick={sendEmail} disabled={isSending}>
                    {isSending ? 'Sending…' : 'Send'}
                  </Button>
                  <Button variant="ghost" onClick={() => { setComposeTo(''); setComposeSubject(''); setComposeBody('') }}>Clear</Button>
                </div>
              </CardContent>
            </Card>

            {/* Today / Agenda */}
            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center">
                  <CalendarIcon className="h-4 w-4 mr-2 text-primary" /> Today
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm text-muted-foreground">Upcoming events appear here from your calendar.</div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Standup Meeting</span>
                    <span className="text-muted-foreground">10:00–11:00</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Client Review</span>
                    <span className="text-muted-foreground">Tomorrow 2:00–3:00</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Links */}
            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center">
                  <Users className="h-4 w-4 mr-2 text-primary" /> Shortcuts
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="justify-start" onClick={() => toast({ title: 'Opening Contacts' })}>Contacts</Button>
                  <Button variant="outline" className="justify-start" onClick={() => toast({ title: 'Opening Calendar' })}>Calendar</Button>
                  <Button variant="outline" className="justify-start" onClick={() => toast({ title: 'Opening AI Assistant' })}><Bot className="mr-2 h-4 w-4" /> AI Assistant</Button>
                  <Button
                    variant="outline"
                    className="justify-start"
                    onClick={() => onNavigate?.('inbox')}
                  >
                    <Mail className="mr-2 h-4 w-4" /> Inbox
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Compose Modal (compact) */}
        {isComposing && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setIsComposing(false)}>
            <div className="bg-card rounded-2xl shadow-xl w-full max-w-xl" onClick={(e) => e.stopPropagation()}>
              <div className="p-4 border-b">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Plus className="h-4 w-4 text-primary" />
                    <span className="font-semibold">New Message</span>
                  </div>
                  <Button variant="ghost" onClick={() => setIsComposing(false)}>Close</Button>
                </div>
              </div>
              <div className="p-4 space-y-3">
                <Input placeholder="To" value={composeTo} onChange={(e) => setComposeTo(e.target.value)} />
                <Input placeholder="Subject" value={composeSubject} onChange={(e) => setComposeSubject(e.target.value)} />
                <Textarea placeholder="Write your message…" value={composeBody} onChange={(e) => setComposeBody(e.target.value)} rows={8} />
                <div className="flex items-center gap-2 pt-1">
                  <Button onClick={sendEmail} disabled={isSending}>{isSending ? 'Sending…' : 'Send'}</Button>
                  <Button variant="outline" onClick={() => setIsComposing(false)}>Cancel</Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}