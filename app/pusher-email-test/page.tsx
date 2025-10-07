'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { usePusher } from '@/hooks/use-pusher'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

interface TestEmail {
  id: string
  subject: string
  from: string
  snippet: string
  timestamp: number
  source?: string
}

export default function PusherEmailTestPage() {
  const { data: session } = useSession()
  const [isLoading, setIsLoading] = useState(false)
  const [lastResponse, setLastResponse] = useState<any>(null)
  const [receivedEmails, setReceivedEmails] = useState<TestEmail[]>([])
  const [pusherLogs, setPusherLogs] = useState<string[]>([])

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString()
    setPusherLogs(prev => [`[${timestamp}] ${message}`, ...prev.slice(0, 19)])
  }

  // Set up Pusher with debug logging
  const pusherState = usePusher({
    onNewEmail: (email: any) => {
      console.log('🔔 Received new email via Pusher:', email)
      addLog(`✅ NEW EMAIL RECEIVED: ${email?.email?.subject || 'Unknown subject'}`)
      
      if (email?.email) {
        setReceivedEmails(prev => [{
          id: email.email.id,
          subject: email.email.subject,
          from: email.email.from,
          snippet: email.email.snippet,
          timestamp: email.timestamp || Date.now(),
          source: email.source
        }, ...prev.slice(0, 9)])
      }
    },
    onEmailUpdate: (data: any) => {
      console.log('📧 Received email update via Pusher:', data)
      addLog(`📧 EMAIL UPDATE: ${data.action} - ${data.count} emails`)
    },
    onEmailDeleted: (emailId: string) => {
      console.log('🗑️ Received email deleted via Pusher:', emailId)
      addLog(`🗑️ EMAIL DELETED: ${emailId}`)
    },
    onError: (error: string) => {
      console.error('❌ Pusher error:', error)
      addLog(`❌ PUSHER ERROR: ${error}`)
    },
    debug: true
  })

  const triggerTestEmail = async () => {
    if (!session) {
      addLog('❌ Not authenticated')
      return
    }

    setIsLoading(true)
    addLog('🚀 Triggering test email event...')

    try {
      const response = await fetch('/api/test-pusher-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      const data = await response.json()
      setLastResponse(data)

      if (response.ok) {
        addLog(`✅ Test email triggered successfully on channel: ${data.channelName}`)
        addLog(`📤 Event: ${data.event}, Email ID: ${data.testEmailId}`)
      } else {
        addLog(`❌ Failed to trigger test email: ${data.error}`)
      }
    } catch (error) {
      console.error('Error triggering test email:', error)
      addLog(`❌ Network error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsLoading(false)
    }
  }

  if (!session) {
    return (
      <div className="container mx-auto p-6">
        <Card className="p-6">
          <h1 className="text-2xl font-bold mb-4">Pusher Email Test</h1>
          <p>Please sign in to test Pusher email events.</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Card className="p-6">
        <h1 className="text-2xl font-bold mb-4">🧪 Pusher Email Pipeline Test</h1>
        <p className="text-gray-600 mb-4">
          This page tests the end-to-end Pusher email delivery pipeline.
        </p>
        
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className={`w-3 h-3 rounded-full ${
              pusherState.isConnected ? 'bg-green-500' : 
              pusherState.isConnecting ? 'bg-yellow-500' : 'bg-red-500'
            }`} />
            <span className="font-medium">
              Pusher Status: {pusherState.isConnected ? 'Connected' : 
                           pusherState.isConnecting ? 'Connecting...' : 'Disconnected'}
            </span>
          </div>
          
          {pusherState.error && (
            <div className="text-red-600 text-sm">
              Error: {pusherState.error}
            </div>
          )}
          
          <div className="text-sm text-gray-600">
            <strong>User:</strong> {session.user.email}<br/>
            <strong>Expected Channel:</strong> user-{session.user.email?.replace('@', '-').replace('.', '-')}<br/>
            <strong>Subscribed Channels:</strong> {pusherState.subscribedChannels.join(', ') || 'None'}
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-xl font-bold mb-4">🚀 Trigger Test Email</h2>
        <Button 
          onClick={triggerTestEmail} 
          disabled={isLoading || !pusherState.isConnected}
          className="mb-4"
        >
          {isLoading ? 'Triggering...' : 'Send Test Email Event'}
        </Button>
        
        {lastResponse && (
          <div className="mt-4 p-3 bg-gray-100 rounded text-sm">
            <strong>Last API Response:</strong>
            <pre className="mt-2 overflow-auto">{JSON.stringify(lastResponse, null, 2)}</pre>
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="text-xl font-bold mb-4">📧 Received Test Emails</h2>
        {receivedEmails.length === 0 ? (
          <p className="text-gray-500">No emails received yet. Trigger a test email above.</p>
        ) : (
          <div className="space-y-3">
            {receivedEmails.map((email) => (
              <div key={email.id} className="border rounded p-3 bg-green-50">
                <div className="font-medium">{email.subject}</div>
                <div className="text-sm text-gray-600">From: {email.from}</div>
                <div className="text-sm text-gray-600">{email.snippet}</div>
                <div className="text-xs text-gray-500 mt-2">
                  ID: {email.id} | Source: {email.source} | {new Date(email.timestamp).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="text-xl font-bold mb-4">📋 Pusher Event Log</h2>
        <div className="bg-black text-green-400 p-4 rounded font-mono text-sm h-64 overflow-y-auto">
          {pusherLogs.length === 0 ? (
            <div className="text-gray-500">Waiting for Pusher events...</div>
          ) : (
            pusherLogs.map((log, index) => (
              <div key={index} className="mb-1">{log}</div>
            ))
          )}
        </div>
      </Card>
    </div>
  )
}