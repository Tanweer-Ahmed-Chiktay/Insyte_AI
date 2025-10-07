import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Test webhook endpoint that simulates Gmail Pub/Sub notifications
// without making actual Gmail API calls
export async function POST(request: NextRequest) {
  try {
    console.log('[Gmail Test Webhook] Received notification')
    
    const body = await request.json()
    console.log('[Gmail Test Webhook] Request body:', JSON.stringify(body, null, 2))

    // Parse the Pub/Sub message
    if (!body.message || !body.message.data) {
      console.log('[Gmail Test Webhook] Invalid message format')
      return NextResponse.json({ error: 'Invalid message format' }, { status: 400 })
    }

    let notificationData
    try {
      const decodedData = Buffer.from(body.message.data, 'base64').toString('utf-8')
      console.log('[Gmail Test Webhook] Decoded data:', decodedData)
      notificationData = JSON.parse(decodedData)
    } catch (error) {
      console.error('[Gmail Test Webhook] Failed to decode message data:', error)
      return NextResponse.json({ error: 'Invalid message format' }, { status: 400 })
    }

    const { emailAddress, historyId } = notificationData
    
    if (!emailAddress || !historyId) {
      console.log('[Gmail Test Webhook] Missing emailAddress or historyId')
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    console.log(`[Gmail Test Webhook] Processing notification for ${emailAddress}, historyId: ${historyId}`)

    // Find the user account for this email
    const user = await prisma.user.findUnique({
      where: { email: emailAddress },
      include: {
        accounts: {
          where: { provider: 'google' }
        }
      }
    })

    if (!user || !user.accounts.length) {
      console.log(`[Gmail Test Webhook] No user found for email: ${emailAddress}`)
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const account = user.accounts[0]
    if (!account.access_token) {
      console.log(`[Gmail Test Webhook] No access token for user: ${emailAddress}`)
      return NextResponse.json({ error: 'No access token' }, { status: 401 })
    }

    console.log(`[Gmail Test Webhook] Found user and account for ${emailAddress}`)
    
    // Simulate successful processing without making actual Gmail API calls
    // In a real scenario, this would:
    // 1. Fetch Gmail history using the API
    // 2. Process new/deleted messages
    // 3. Update the database
    // 4. Send WebSocket notifications
    
    // For testing, just update the historyId
    await prisma.user.update({
      where: { id: user.id },
      data: { historyId: historyId }
    })
    
    // Simulate processing some messages
    const simulatedResponse = {
      success: true,
      message: 'Test webhook processed successfully',
      user: {
        email: emailAddress,
        id: user.id
      },
      account: {
        provider: account.provider,
        hasAccessToken: !!account.access_token
      },
      processing: {
        historyId: historyId,
        previousHistoryId: user.historyId,
        simulatedNewMessages: 2,
        simulatedDeletedMessages: 0
      }
    }
    
    console.log('[Gmail Test Webhook] Simulated processing complete:', simulatedResponse)
    
    return NextResponse.json(simulatedResponse)
    
  } catch (error) {
    console.error('[Gmail Test Webhook] Error processing notification:', error)
    return NextResponse.json({ 
      error: 'Failed to process notification', 
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// GET endpoint to check webhook status
export async function GET(request: NextRequest) {
  return NextResponse.json({ 
    status: 'Gmail Test Webhook is running',
    timestamp: new Date().toISOString(),
    environment: 'test'
  })
}