'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { CheckCircle, XCircle, Clock, Wifi, WifiOff } from 'lucide-react'

interface PushNotification {
  type: string
  timestamp: string
  message?: any
  notification?: any
  userEmail?: string
}

export default function TestPushPage() {
  const { data: session, status } = useSession()
  const [isConnected, setIsConnected] = useState(false)
  const [notifications, setNotifications] = useState<PushNotification[]>([])
  const [watchStatus, setWatchStatus] = useState<'idle' | 'setting-up' | 'active' | 'error'>('idle')
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected')
  const eventSourceRef = useRef<EventSource | null>(null)

  // Connect to SSE endpoint
  const connectToSSE = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    setConnectionStatus('connecting')
    const eventSource = new EventSource('/api/gmail/push-notifications', {
      withCredentials: true
    })
    eventSourceRef.current = eventSource

    eventSource.onopen = () => {
      console.log('SSE connection opened')
      setIsConnected(true)
      setConnectionStatus('connected')
    }

    eventSource.onmessage = (event) => {
      try {
        const data: PushNotification = JSON.parse(event.data)
        console.log('Received push notification:', data)
        setNotifications(prev => [data, ...prev].slice(0, 20)) // Keep last 20
      } catch (error) {
        console.error('Failed to parse SSE message:', error)
      }
    }

    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error)
      setIsConnected(false)
      setConnectionStatus('error')
    }
  }

  // Disconnect from SSE
  const disconnectFromSSE = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    setIsConnected(false)
    setConnectionStatus('disconnected')
  }

  // Setup Gmail watch
  const setupGmailWatch = async () => {
    setWatchStatus('setting-up')
    try {
      const response = await fetch('/api/gmail/watch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        const result = await response.json()
        console.log('Gmail watch setup successful:', result)
        setWatchStatus('active')
      } else {
        const error = await response.text()
        console.error('Gmail watch setup failed:', error)
        setWatchStatus('error')
      }
    } catch (error) {
      console.error('Gmail watch setup error:', error)
      setWatchStatus('error')
    }
  }

  // Test webhook endpoint
  const testWebhook = async () => {
    try {
      const testPayload = {
        message: {
          data: Buffer.from(JSON.stringify({
            emailAddress: session?.user?.email,
            historyId: Date.now().toString()
          })).toString('base64'),
          messageId: `test_${Date.now()}`,
          publishTime: new Date().toISOString()
        },
        subscription: 'test-subscription'
      }

      const response = await fetch('/api/gmail/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Google-Cloud-Pub-Sub'
        },
        body: JSON.stringify(testPayload)
      })

      if (response.ok) {
        console.log('Test webhook sent successfully')
      } else {
        console.error('Test webhook failed:', await response.text())
      }
    } catch (error) {
      console.error('Test webhook error:', error)
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnectFromSSE()
    }
  }, [])

  if (status === 'loading') {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>
  }

  if (!session) {
    return <div className="flex items-center justify-center min-h-screen">Please sign in to test push notifications.</div>
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected':
      case 'active':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'connecting':
      case 'setting-up':
        return <Clock className="h-4 w-4 text-yellow-500" />
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />
      default:
        return <XCircle className="h-4 w-4 text-gray-400" />
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Gmail Push Notifications Test</h1>
        <Badge variant="outline">{session.user.email}</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Connection Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {isConnected ? <Wifi className="h-5 w-5" /> : <WifiOff className="h-5 w-5" />}
              SSE Connection
            </CardTitle>
            <CardDescription>
              Server-Sent Events connection for real-time notifications
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              {getStatusIcon(connectionStatus)}
              <span className="capitalize">{connectionStatus}</span>
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={connectToSSE} 
                disabled={isConnected}
                size="sm"
              >
                Connect
              </Button>
              <Button 
                onClick={disconnectFromSSE} 
                disabled={!isConnected}
                variant="outline"
                size="sm"
              >
                Disconnect
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Gmail Watch Status */}
        <Card>
          <CardHeader>
            <CardTitle>Gmail Watch</CardTitle>
            <CardDescription>
              Gmail API watch setup for push notifications
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              {getStatusIcon(watchStatus)}
              <span className="capitalize">{watchStatus.replace('-', ' ')}</span>
            </div>
            <Button 
              onClick={setupGmailWatch}
              disabled={watchStatus === 'setting-up'}
              size="sm"
            >
              Setup Gmail Watch
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Test Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Test Actions</CardTitle>
          <CardDescription>
            Test the push notification system
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={testWebhook} variant="outline">
            Send Test Webhook
          </Button>
        </CardContent>
      </Card>

      {/* Notifications Log */}
      <Card>
        <CardHeader>
          <CardTitle>Notifications Log</CardTitle>
          <CardDescription>
            Real-time notifications received via SSE
          </CardDescription>
        </CardHeader>
        <CardContent>
          {notifications.length === 0 ? (
            <p className="text-muted-foreground">No notifications received yet.</p>
          ) : (
            <div className="space-y-3">
              {notifications.map((notification, index) => (
                <div key={index} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="secondary">{notification.type}</Badge>
                    <span className="text-sm text-muted-foreground">
                      {new Date(notification.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                    {JSON.stringify(notification, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Configuration Info */}
      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
          <CardDescription>
            Current environment configuration
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div><strong>Project ID:</strong> {process.env.NEXT_PUBLIC_GOOGLE_CLOUD_PROJECT_ID || 'Not configured'}</div>
            <div><strong>Environment:</strong> {process.env.NODE_ENV}</div>
            <div><strong>Base URL:</strong> {typeof window !== 'undefined' ? window.location.origin : 'Server-side'}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}