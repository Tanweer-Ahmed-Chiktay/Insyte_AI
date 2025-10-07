'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { getPusherClientConfig } from '@/lib/pusher-config'
import PusherClient from 'pusher-js'

export default function PusherDebugPage() {
  const { data: session } = useSession()
  const [config, setConfig] = useState<any>(null)
  const [connectionStatus, setConnectionStatus] = useState('Not connected')
  const [error, setError] = useState<string | null>(null)
  const [logs, setLogs] = useState<string[]>([])

  const addLog = (message: string) => {
    const timestamp = new Date().toISOString()
    setLogs(prev => [...prev, `${timestamp}: ${message}`])
    console.log(`[Pusher Debug] ${message}`)
  }

  useEffect(() => {
    // Get and display config
    const pusherConfig = getPusherClientConfig()
    setConfig(pusherConfig)
    addLog(`Config loaded: key=${pusherConfig.key ? 'SET' : 'MISSING'}, cluster=${pusherConfig.cluster}`)
  }, [])

  const testConnection = () => {
    if (!config) {
      addLog('No config available')
      return
    }

    addLog('Starting Pusher connection test...')
    setError(null)
    setConnectionStatus('Connecting...')

    try {
      const pusher = new PusherClient(config.key, {
        cluster: config.cluster,
        forceTLS: true,
        authEndpoint: '/api/pusher/auth',
        auth: {
          headers: {
            'Content-Type': 'application/json',
          },
        },
      })

      pusher.connection.bind('connected', () => {
        addLog('✅ Connected to Pusher successfully!')
        setConnectionStatus('Connected')
      })

      pusher.connection.bind('connecting', () => {
        addLog('🔄 Connecting to Pusher...')
        setConnectionStatus('Connecting')
      })

      pusher.connection.bind('disconnected', () => {
        addLog('❌ Disconnected from Pusher')
        setConnectionStatus('Disconnected')
      })

      pusher.connection.bind('error', (error: any) => {
        addLog(`❌ Pusher connection error: ${JSON.stringify(error)}`)
        setError(JSON.stringify(error, null, 2))
        setConnectionStatus('Error')
      })

      // Test subscription if user is logged in
      if (session?.user?.email) {
        const userChannel = `user-${session.user.email.replace('@', '-').replace('.', '-')}`
        addLog(`Attempting to subscribe to channel: ${userChannel}`)
        
        const channel = pusher.subscribe(userChannel)
        
        channel.bind('pusher:subscription_succeeded', () => {
          addLog(`✅ Successfully subscribed to ${userChannel}`)
        })
        
        channel.bind('pusher:subscription_error', (error: any) => {
          addLog(`❌ Subscription error: ${JSON.stringify(error)}`)
        })
      }

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error'
      addLog(`❌ Failed to initialize Pusher: ${errorMsg}`)
      setError(errorMsg)
      setConnectionStatus('Failed to initialize')
    }
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Pusher Debug Page</h1>
      
      <div className="space-y-6">
        {/* Session Info */}
        <div className="bg-gray-100 p-4 rounded">
          <h2 className="font-semibold mb-2">Session Info</h2>
          <p>User: {session?.user?.email || 'Not logged in'}</p>
          <p>Status: {session ? 'Authenticated' : 'Not authenticated'}</p>
        </div>

        {/* Config Info */}
        <div className="bg-blue-100 p-4 rounded">
          <h2 className="font-semibold mb-2">Pusher Configuration</h2>
          {config ? (
            <div>
              <p>Key: {config.key ? `${config.key.substring(0, 8)}...` : 'MISSING'}</p>
              <p>Cluster: {config.cluster || 'MISSING'}</p>
              <p>Key Length: {config.key?.length || 0}</p>
            </div>
          ) : (
            <p>Loading config...</p>
          )}
        </div>

        {/* Connection Test */}
        <div className="bg-green-100 p-4 rounded">
          <h2 className="font-semibold mb-2">Connection Test</h2>
          <p>Status: <span className="font-mono">{connectionStatus}</span></p>
          <button 
            onClick={testConnection}
            className="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Test Connection
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-100 p-4 rounded">
            <h2 className="font-semibold mb-2">Error Details</h2>
            <pre className="text-sm overflow-auto">{error}</pre>
          </div>
        )}

        {/* Logs */}
        <div className="bg-gray-100 p-4 rounded">
          <h2 className="font-semibold mb-2">Debug Logs</h2>
          <div className="max-h-64 overflow-auto">
            {logs.map((log, index) => (
              <div key={index} className="text-sm font-mono mb-1">
                {log}
              </div>
            ))}
          </div>
          <button 
            onClick={() => setLogs([])}
            className="mt-2 px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600"
          >
            Clear Logs
          </button>
        </div>
      </div>
    </div>
  )
}