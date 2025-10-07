'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'

export default function WebSocketDebugPage() {
  const { data: session, status } = useSession()
  const [wsStatus, setWsStatus] = useState('Disconnected')
  const [messages, setMessages] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const addMessage = (msg: string) => {
    setMessages(prev => [...prev.slice(-9), `${new Date().toLocaleTimeString()}: ${msg}`])
  }

  const testWebSocketConnection = async () => {
    if (status !== 'authenticated' || !session) {
      setError('Not authenticated')
      return
    }

    try {
      setError(null)
      addMessage('Fetching WebSocket token...')
      
      const response = await fetch('/api/ws', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      })

      if (!response.ok) {
        throw new Error(`Failed to get token: ${response.status}`)
      }

      const data = await response.json()
      addMessage(`Got token and URL: ${data.wsUrl}`)

      // Test WebSocket connection
      setWsStatus('Connecting...')
      const ws = new WebSocket(data.wsUrl)

      ws.onopen = () => {
        setWsStatus('Connected')
        addMessage('WebSocket connected successfully!')
        
        // Test sending a message
        ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }))
      }

      ws.onmessage = (event) => {
        console.log('WebSocket message received:', event.data)
        try {
          const data = JSON.parse(event.data)
          addMessage(`Received: ${data.type || 'message'} - ${JSON.stringify(data, null, 2)}`)
        } catch (e) {
          addMessage(`Received: ${event.data}`)
        }
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        setWsStatus('Error')
        addMessage(`WebSocket error: ${error.toString()}`)
        setError('WebSocket connection failed')
      }

      ws.onclose = (event) => {
        setWsStatus('Disconnected')
        addMessage(`WebSocket closed: ${event.code} - ${event.reason}`)
      }

      // Clean up after 30 seconds
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close()
        }
      }, 30000)

    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unknown error')
      addMessage(`Error: ${error}`)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">WebSocket Debug Tool</h1>
      
      <div className="mb-4">
        <p><strong>Session Status:</strong> {status}</p>
        <p><strong>User Email:</strong> {session?.user?.email || 'Not logged in'}</p>
        <p><strong>WebSocket Status:</strong> {wsStatus}</p>
        {error && <p className="text-red-500"><strong>Error:</strong> {error}</p>}
      </div>

      <button 
        onClick={testWebSocketConnection}
        disabled={status !== 'authenticated'}
        className="bg-blue-500 text-white px-4 py-2 rounded disabled:bg-gray-300 mb-4"
      >
        Test WebSocket Connection
      </button>

      <div className="border rounded p-4 bg-gray-50">
        <h3 className="font-semibold mb-2">Connection Log:</h3>
        <div className="space-y-1 text-sm font-mono">
          {messages.map((msg, i) => (
            <div key={i}>{msg}</div>
          ))}
        </div>
      </div>
    </div>
  )
}