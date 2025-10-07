# Gmail Pub/Sub Worker for Cloud Run

This Cloud Run service processes Gmail push notifications via Google Cloud Pub/Sub, enabling real-time email synchronization for the InSyte application.

## Architecture Overview

```
Gmail API → Pub/Sub Topic → Cloud Run Worker → Database + Realtime Events
```

1. **Gmail Watch**: Registers push notifications for user mailboxes
2. **Pub/Sub**: Receives Gmail events and queues them for processing
3. **Cloud Run Worker**: Processes events, fetches email data, updates database
4. **Realtime Events**: Broadcasts updates to connected clients via Supabase Realtime

## Features

- ✅ **Auto-scaling**: Handles 0 to 1M+ users with Cloud Run's automatic scaling
- ✅ **Cost-effective**: Pay-per-request pricing with no idle costs
- ✅ **Reliable**: Built-in retry mechanisms and error handling
- ✅ **Real-time**: Instant UI updates via Supabase Realtime
- ✅ **Secure**: Encrypted token storage and secure API access

## Prerequisites

1. **Google Cloud Project** with billing enabled
2. **Supabase Project** for database and realtime features
3. **Gmail API** credentials (OAuth 2.0)
4. **Google Cloud CLI** installed and authenticated

## Environment Variables

Create these secrets in Google Cloud Secret Manager:

```bash
# Google OAuth credentials
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
NEXTAUTH_URL="https://your-app.vercel.app"

# Supabase configuration
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Encryption key for token storage
ENCRYPTION_KEY="your-32-character-encryption-key"

# Google Cloud Project
GOOGLE_CLOUD_PROJECT_ID="your-gcp-project-id"
```

## Quick Deployment

1. **Set environment variables**:
   ```bash
   export GOOGLE_CLOUD_PROJECT_ID="your-project-id"
   export GOOGLE_CLIENT_ID="your-client-id"
   export GOOGLE_CLIENT_SECRET="your-client-secret"
   export NEXTAUTH_URL="https://your-app.vercel.app"
   export SUPABASE_URL="https://your-project.supabase.co"
   export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
   export ENCRYPTION_KEY="your-encryption-key"
   ```

2. **Run deployment script**:
   ```bash
   ./deploy.sh
   ```

3. **Update Vercel environment variables**:
   ```bash
   # Add the Pub/Sub topic name to Vercel
   npx vercel env add GMAIL_PUBSUB_TOPIC production
   # Value: projects/your-project-id/topics/gmail-notifications
   ```

## Manual Deployment

If you prefer manual deployment:

### 1. Build and Push Docker Image

```bash
# Set your project ID
export PROJECT_ID="your-gcp-project-id"

# Build the image
gcloud builds submit --tag gcr.io/$PROJECT_ID/gmail-pubsub-worker .
```

### 2. Create Secrets

```bash
# Create secrets in Google Cloud Secret Manager
echo -n "$GOOGLE_CLIENT_ID" | gcloud secrets create gmail-worker-google-client-id --data-file=-
echo -n "$GOOGLE_CLIENT_SECRET" | gcloud secrets create gmail-worker-google-client-secret --data-file=-
echo -n "$NEXTAUTH_URL" | gcloud secrets create gmail-worker-nextauth-url --data-file=-
echo -n "$SUPABASE_URL" | gcloud secrets create gmail-worker-supabase-url --data-file=-
echo -n "$SUPABASE_SERVICE_ROLE_KEY" | gcloud secrets create gmail-worker-supabase-key --data-file=-
echo -n "$ENCRYPTION_KEY" | gcloud secrets create gmail-worker-encryption-key --data-file=-
```

### 3. Deploy to Cloud Run

```bash
gcloud run deploy gmail-pubsub-worker \
    --image gcr.io/$PROJECT_ID/gmail-pubsub-worker \
    --platform managed \
    --region us-central1 \
    --allow-unauthenticated \
    --memory 1Gi \
    --cpu 1 \
    --concurrency 1000 \
    --timeout 300 \
    --min-instances 0 \
    --max-instances 100 \
    --set-env-vars="PORT=8080,GOOGLE_CLOUD_PROJECT_ID=$PROJECT_ID" \
    --set-secrets="GOOGLE_CLIENT_ID=gmail-worker-google-client-id:latest,GOOGLE_CLIENT_SECRET=gmail-worker-google-client-secret:latest,NEXTAUTH_URL=gmail-worker-nextauth-url:latest,SUPABASE_URL=gmail-worker-supabase-url:latest,SUPABASE_SERVICE_ROLE_KEY=gmail-worker-supabase-key:latest,ENCRYPTION_KEY=gmail-worker-encryption-key:latest"
```

### 4. Create Pub/Sub Topic and Subscription

```bash
# Create topic
gcloud pubsub topics create gmail-notifications

# Get Cloud Run service URL
SERVICE_URL=$(gcloud run services describe gmail-pubsub-worker --platform managed --region us-central1 --format 'value(status.url)')

# Create subscription
gcloud pubsub subscriptions create gmail-notifications-sub \
    --topic gmail-notifications \
    --push-endpoint "$SERVICE_URL/pubsub" \
    --ack-deadline 600
```

## Integration with Vercel App

### 1. Update Gmail Watch Registration

Modify your Gmail watch setup in the Vercel app to use the Pub/Sub topic:

```javascript
// In your Gmail API setup
const watchRequest = {
  userId: 'me',
  requestBody: {
    topicName: `projects/${process.env.GOOGLE_CLOUD_PROJECT_ID}/topics/gmail-notifications`,
    labelIds: ['INBOX'],
    labelFilterAction: 'include'
  }
};

await gmail.users.watch(watchRequest);
```

### 2. Add Environment Variables to Vercel

```bash
npx vercel env add GMAIL_PUBSUB_TOPIC production
# Value: projects/your-project-id/topics/gmail-notifications

npx vercel env add GOOGLE_CLOUD_PROJECT_ID production
# Value: your-gcp-project-id
```

### 3. Update Frontend for Realtime Events

Use Supabase Realtime to listen for email events:

```javascript
// In your React component
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

useEffect(() => {
  const channel = supabase.channel(`user_${userId}`)
  
  channel
    .on('broadcast', { event: 'new_email' }, (payload) => {
      // Handle new email
      console.log('New email:', payload)
    })
    .on('broadcast', { event: 'email_updated' }, (payload) => {
      // Handle email updates (read/unread, starred, etc.)
      console.log('Email updated:', payload)
    })
    .on('broadcast', { event: 'email_deleted' }, (payload) => {
      // Handle email deletion
      console.log('Email deleted:', payload)
    })
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}, [userId])
```

## Monitoring and Debugging

### View Logs

```bash
# View Cloud Run logs
gcloud logs read --service gmail-pubsub-worker --limit 50

# Follow logs in real-time
gcloud logs tail --service gmail-pubsub-worker
```

### Test the Service

```bash
# Get service URL
SERVICE_URL=$(gcloud run services describe gmail-pubsub-worker --platform managed --region us-central1 --format 'value(status.url)')

# Test health endpoint
curl "$SERVICE_URL/health"

# Test Pub/Sub endpoint (requires valid message)
curl -X POST "$SERVICE_URL/pubsub" \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "data": "eyJlbWFpbEFkZHJlc3MiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiaGlzdG9yeUlkIjoiMTIzNDUifQ=="
    }
  }'
```

### Monitor Pub/Sub

```bash
# View topic details
gcloud pubsub topics describe gmail-notifications

# View subscription details
gcloud pubsub subscriptions describe gmail-notifications-sub

# Pull messages manually (for debugging)
gcloud pubsub subscriptions pull gmail-notifications-sub --limit=5
```

## Scaling and Performance

- **Concurrency**: Set to 1000 requests per instance
- **Memory**: 1GB per instance (adjust based on usage)
- **CPU**: 1 vCPU per instance
- **Timeout**: 300 seconds for processing
- **Auto-scaling**: 0 to 100 instances based on demand

## Security Considerations

1. **Secrets Management**: All sensitive data stored in Google Cloud Secret Manager
2. **Token Encryption**: OAuth tokens encrypted before database storage
3. **Network Security**: Cloud Run service allows unauthenticated access only for Pub/Sub
4. **Database Access**: Uses Supabase service role key with restricted permissions

## Troubleshooting

### Common Issues

1. **Authentication Errors**:
   - Verify Google Cloud credentials
   - Check secret values in Secret Manager
   - Ensure service account has proper permissions

2. **Pub/Sub Not Receiving Messages**:
   - Verify Gmail watch is properly configured
   - Check Pub/Sub topic and subscription setup
   - Ensure push endpoint URL is correct

3. **Database Connection Issues**:
   - Verify Supabase URL and service role key
   - Check database schema matches expected structure
   - Ensure proper table permissions

4. **Realtime Events Not Working**:
   - Verify Supabase Realtime is enabled
   - Check channel subscription in frontend
   - Ensure proper authentication for realtime connection

### Debug Commands

```bash
# Check service status
gcloud run services describe gmail-pubsub-worker --region us-central1

# View recent deployments
gcloud run revisions list --service gmail-pubsub-worker --region us-central1

# Check Pub/Sub metrics
gcloud monitoring metrics list --filter="resource.type=pubsub_topic"
```

## Cost Optimization

- **Minimum Instances**: Set to 0 for cost savings
- **Request Timeout**: Optimized to 300 seconds
- **Memory Allocation**: Right-sized to 1GB
- **Pub/Sub**: Pay per message processed
- **Cloud Run**: Pay per 100ms of CPU time used

Estimated costs for 1M users with moderate email activity: ~$50-100/month

## Support

For issues and questions:
1. Check the logs using the commands above
2. Review the troubleshooting section
3. Open an issue in the project repository