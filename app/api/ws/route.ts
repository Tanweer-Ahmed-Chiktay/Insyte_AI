import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
// Use the same WebSocket manager instance as the custom server (CommonJS module)
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - importing CJS module in TS file
import wsModule from '@/lib/websocket/websocket-server.js'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const wsManager = (wsModule as any).wsManager
import jwt from 'jsonwebtoken'

// WebSocket upgrade endpoint
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return new Response('Unauthorized', { status: 401 })
    }

    // Check if running on Vercel (serverless environment)
    if (process.env.VERCEL) {
      console.log('[WebSocket API] WebSocket not supported in serverless environment')
      return Response.json({
        success: false,
        error: 'WebSocket not supported in serverless environment',
        fallbackMode: true,
        userEmail: session.user.email
      }, { status: 503 })
    }

    // Generate JWT token for WebSocket authentication
    const token = jwt.sign(
      { sub: session.user.email },
      process.env.NEXTAUTH_SECRET!,
      { expiresIn: '24h' }
    )

    // Return connection info for client-side WebSocket connection
    return Response.json({
      success: true,
      token,
      wsUrl: (() => {
        const protocol = process.env.NODE_ENV === 'production' ? 'wss:' : 'ws:';
        const host = process.env.NODE_ENV === 'production' 
          ? request.headers.get('host') || 'localhost:3000'
          : `localhost:${process.env.WS_PORT || 3001}`;
        return `${protocol}//${host}/api/ws?token=${token}`;
      })(),
      userEmail: session.user.email
    })
    
  } catch (error) {
    console.error('[WebSocket API] Error:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}

// Handle WebSocket upgrade in server.js or custom server
// This endpoint provides connection details for client-side WebSocket setup
export async function POST(request: NextRequest) {
  try {
    const { action, data } = await request.json()
    
    switch (action) {
      case 'broadcast':
        const { userId, message } = data
        wsManager.broadcastToUser(userId, message)
        return Response.json({ success: true })
        
      case 'stats':
        const stats = wsManager.getStats()
        return Response.json({
          connectedClients: stats.totalConnections,
          totalUsers: stats.totalUsers,
          userConnections: data.userId ? wsManager.getUserConnections(data.userId) : 0
        })
        
      default:
        return Response.json({ error: 'Invalid action' }, { status: 400 })
    }
    
  } catch (error) {
    console.error('[WebSocket API] POST Error:', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}