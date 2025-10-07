# Gmail Push Notifications Setup Guide

This guide covers the complete setup and configuration of Gmail push notifications for real-time email synchronization.

## Overview

The push notification system consists of:
- **Google Cloud Pub/Sub** for receiving Gmail notifications
- **Server-Sent Events (SSE)** for real-time client updates
- **Webhook endpoints** for processing notifications
- **Connection management** for handling multiple clients

## Architecture

```
Gmail API → Google Cloud Pub/Sub → Webhook Endpoint → SSE Broadcast → Frontend
```

## Configuration Files

### Environment Variables

Add these to your `.env` file:

```env
# Required for push notifications
GOOGLE_CLOUD_PROJECT_ID=insyte-467414
GMAIL_PUBSUB_TOPIC=projects/insyte-467414/topics/MyTopic
GMAIL_WEBHOOK_URL=https://your-domain.com/api/gmail/webhook

# For development with ngrok
# GMAIL_WEBHOOK_URL=https://your-ngrok-url.ngrok.io/api/gmail/webhook
```

### Key Components

1. **SSE Connection Manager** (`lib/sse-connection-manager.ts`)
   - Manages WebSocket-like connections for real-time updates
   - Handles connection cleanup and broadcasting
   - Supports multiple connections per user

2. **Gmail Push Service** (`lib/gmail-push-service.ts`)
   - Handles Gmail API watch setup
   - Processes push notifications
   - Manages fallback polling

3. **API Routes**:
   - `/api/gmail/push-notifications` - SSE endpoint for clients
   - `/api/gmail/webhook` - Receives Pub/Sub notifications
   - `/api/gmail/watch` - Sets up Gmail watch

## Setup Steps

### 1. Google Cloud Setup

Follow the detailed instructions in `GMAIL_PUBSUB_SETUP.md`:

```bash
# Enable APIs
gcloud services enable pubsub.googleapis.com
gcloud services enable gmail.googleapis.com

# Create topic
gcloud pubsub topics create MyTopic

# Set permissions
gcloud pubsub topics add-iam-policy-binding MyTopic \
    --member=serviceAccount:gmail-api-push@system.gserviceaccount.com \
    --role=roles/pubsub.publisher
```

### 2. Development Setup

For local development, you need to expose your webhook endpoint:

```bash
# Install ngrok
npm install -g ngrok

# Expose localhost:3000
ngrok http 3000

# Update .env with ngrok URL
GMAIL_WEBHOOK_URL=https://abc123.ngrok.io/api/gmail/webhook
```

### 3. Testing

Use the test page at `/test-push` to:
- Connect to SSE endpoint
- Setup Gmail watch
- Send test webhooks
- Monitor real-time notifications

## API Endpoints

### GET `/api/gmail/push-notifications`

Server-Sent Events endpoint for real-time notifications.

**Response Format:**
```javascript
{
  type: 'gmail-push-notification',
  message: {
    data: 'base64-encoded-data',
    messageId: 'msg_123',
    publishTime: '2024-01-01T00:00:00Z'
  },
  notification: {
    emailAddress: 'user@example.com',
    historyId: '12345'
  },
  timestamp: '2024-01-01T00:00:00Z',
  syncStarted: true
}
```

### POST `/api/gmail/webhook`

Receives Pub/Sub notifications from Google Cloud.

**Request Format:**
```javascript
{
  message: {
    data: 'base64-encoded-gmail-notification',
    messageId: 'msg_123',
    publishTime: '2024-01-01T00:00:00Z'
  },
  subscription: 'projects/project-id/subscriptions/subscription-name'
}
```

### POST `/api/gmail/watch`

Sets up Gmail API watch for push notifications.

**Request Body:**
```javascript
{
  labelIds: ['INBOX', 'UNREAD'],
  labelFilterAction: 'include'
}
```

## Frontend Integration

### Connecting to SSE

```javascript
const eventSource = new EventSource('/api/gmail/push-notifications')

eventSource.onmessage = (event) => {
  const notification = JSON.parse(event.data)
  console.log('Gmail notification:', notification)
  
  // Handle different notification types
  switch (notification.type) {
    case 'connection-established':
      console.log('Connected to push notifications')
      break
    case 'gmail-push-notification':
      console.log('New Gmail activity:', notification.notification)
      // Trigger email sync or update UI
      break
  }
}

eventSource.onerror = (error) => {
  console.error('SSE connection error:', error)
}
```

### Setting up Gmail Watch

```javascript
const setupWatch = async () => {
  try {
    const response = await fetch('/api/gmail/watch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    
    if (response.ok) {
      console.log('Gmail watch setup successful')
    }
  } catch (error) {
    console.error('Failed to setup Gmail watch:', error)
  }
}
```

## Troubleshooting

### Common Issues

1. **"Invalid URL" errors**
   - Ensure `NEXTAUTH_URL` is set correctly
   - Check that the server is using absolute URLs for API calls

2. **No notifications received**
   - Verify Google Cloud Pub/Sub topic permissions
   - Check that Gmail watch is active (`/test-push` page)
   - Ensure webhook URL is accessible from Google Cloud

3. **SSE connection failures**
   - Check browser network tab for connection errors
   - Verify authentication (user must be signed in)
   - Monitor server logs for SSE-related errors

4. **Webhook validation failures**
   - Ensure webhook endpoint returns 200 status
   - Check User-Agent header contains 'Google-Cloud-Pub-Sub'
   - Verify message data is properly base64 encoded

### Debug Tools

1. **Test Page** (`/test-push`)
   - Real-time connection status
   - Gmail watch setup
   - Test webhook sending
   - Notification log

2. **Server Logs**
   ```bash
   # Monitor for push notification activity
   npm run dev | grep -E "(SSE|Webhook|GmailPushService)"
   ```

3. **Browser DevTools**
   - Network tab: Monitor SSE connection
   - Console: Check for JavaScript errors
   - Application tab: Verify service worker (if used)

## Production Considerations

### Security
- Use HTTPS for all webhook endpoints
- Validate Pub/Sub message signatures
- Implement rate limiting on webhook endpoints
- Monitor for suspicious activity

### Performance
- Connection cleanup runs every 30 minutes
- Notification deduplication (5-minute window)
- Fallback polling when push notifications fail
- Batch processing for high-volume accounts

### Monitoring
- Track SSE connection counts
- Monitor webhook response times
- Alert on Gmail watch expiration
- Log notification processing metrics

## Files Modified/Created

- ✅ `lib/sse-connection-manager.ts` - SSE connection management
- ✅ `lib/gmail-push-service.ts` - Enhanced with proper URL handling
- ✅ `app/api/gmail/push-notifications/route.ts` - SSE endpoint
- ✅ `app/api/gmail/webhook/route.ts` - Enhanced webhook handling
- ✅ `app/api/gmail/watch/route.ts` - Gmail watch setup
- ✅ `app/test-push/page.tsx` - Comprehensive test interface
- ✅ `.env.example` - Updated environment variables
- ✅ `GMAIL_PUBSUB_SETUP.md` - Updated setup guide

## Next Steps

1. **Production Deployment**
   - Set up production Google Cloud project
   - Configure production webhook URL
   - Enable monitoring and alerting

2. **Enhanced Features**
   - Message signature verification
   - Advanced filtering options
   - Notification preferences
   - Analytics dashboard

3. **Testing**
   - Load testing with multiple connections
   - Failover testing
   - End-to-end notification flow testing