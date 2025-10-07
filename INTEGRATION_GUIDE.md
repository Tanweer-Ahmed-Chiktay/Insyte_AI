# Gmail Pub/Sub Integration Guide

This guide explains how to integrate the Cloud Run Gmail Pub/Sub worker with your existing Vercel application for real-time email synchronization.

## Overview

The integration involves:
1. **Vercel App**: Handles OAuth, user interface, and direct API calls
2. **Cloud Run Worker**: Processes Gmail push notifications via Pub/Sub
3. **Supabase**: Shared database and realtime event broadcasting
4. **Gmail API**: Push notifications and email data

## Architecture Flow

```
[User] → [Vercel App] → [Gmail OAuth] → [Gmail Watch] → [Pub/Sub]
                ↓                                        ↓
        [Supabase Database] ← [Cloud Run Worker] ← [Pub/Sub]
                ↓                     ↓
        [Realtime Events] → [Frontend Updates]
```

## Step 1: Update Vercel Application

### 1.1 Install Required Dependencies

```bash
npm install @google-cloud/pubsub @supabase/supabase-js
```

### 1.2 Add Environment Variables

Add these to your Vercel environment:

```bash
# Google Cloud Configuration
npx vercel env add GOOGLE_CLOUD_PROJECT_ID production
# Value: your-gcp-project-id

npx vercel env add GMAIL_PUBSUB_TOPIC production
# Value: projects/your-project-id/topics/gmail-notifications

# Supabase Configuration (if not already added)
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
```

### 1.3 Update Gmail OAuth Flow

Modify your Gmail connection API route to register push notifications:

```javascript
// pages/api/auth/gmail/connect.js or app/api/auth/gmail/connect/route.js
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import { encrypt } from '@/lib/utils/encryption';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    const { code, userId } = await request.json();
    
    // Exchange code for tokens
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.NEXTAUTH_URL + '/api/auth/gmail/callback'
    );
    
    const { tokens } = await oauth2Client.getTokens(code);
    oauth2Client.setCredentials(tokens);
    
    // Get user email
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const profile = await gmail.users.getProfile({ userId: 'me' });
    const userEmail = profile.data.emailAddress;
    
    // Register Gmail watch (push notifications)
    const watchResponse = await gmail.users.watch({
      userId: 'me',
      requestBody: {
        topicName: process.env.GMAIL_PUBSUB_TOPIC,
        labelIds: ['INBOX'],
        labelFilterAction: 'include'
      }
    });
    
    // Store encrypted credentials in database
    const encryptedRefreshToken = encrypt(tokens.refresh_token);
    const encryptedAccessToken = encrypt(tokens.access_token);
    
    await supabase
      .from('gmail_credentials')
      .upsert({
        user_id: userId,
        email: userEmail,
        encrypted_refresh_token: encryptedRefreshToken,
        encrypted_access_token: encryptedAccessToken,
        token_expires_at: new Date(tokens.expiry_date),
        scope: tokens.scope,
        watch_expiration: new Date(parseInt(watchResponse.data.expiration)),
        history_id: watchResponse.data.historyId,
        is_active: true
      });
    
    return Response.json({ 
      success: true, 
      email: userEmail,
      watchExpiration: watchResponse.data.expiration
    });
    
  } catch (error) {
    console.error('Gmail connection error:', error);
    return Response.json({ error: 'Failed to connect Gmail' }, { status: 500 });
  }
}
```

### 1.4 Create Encryption Utilities

Create `lib/utils/encryption.js`:

```javascript
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const ALGORITHM = 'aes-256-gcm';

export function encrypt(text) {
  if (!text) return null;
  
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipher(ALGORITHM, ENCRYPTION_KEY);
  cipher.setAAD(Buffer.from('gmail-token'));
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
}

export function decrypt(encryptedData) {
  if (!encryptedData) return null;
  
  const { encrypted, iv, authTag } = encryptedData;
  
  const decipher = crypto.createDecipher(ALGORITHM, ENCRYPTION_KEY);
  decipher.setAAD(Buffer.from('gmail-token'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}
```

### 1.5 Add Realtime Event Listener

Update your main email component to listen for realtime events:

```javascript
// components/EmailList.jsx
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useSession } from 'next-auth/react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function EmailList() {
  const { data: session } = useSession();
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    if (!session?.user?.id) return;
    
    // Load initial emails
    loadEmails();
    
    // Subscribe to realtime events
    const channel = supabase.channel(`user_${session.user.id}`);
    
    channel
      .on('broadcast', { event: 'new_email' }, (payload) => {
        console.log('New email received:', payload);
        setEmails(prev => [payload.email, ...prev]);
        
        // Show notification
        if (Notification.permission === 'granted') {
          new Notification('New Email', {
            body: `From: ${payload.email.sender_name}\n${payload.email.subject}`,
            icon: '/favicon.ico'
          });
        }
      })
      .on('broadcast', { event: 'email_updated' }, (payload) => {
        console.log('Email updated:', payload);
        setEmails(prev => prev.map(email => 
          email.gmail_id === payload.email.gmail_id 
            ? { ...email, ...payload.email }
            : email
        ));
      })
      .on('broadcast', { event: 'email_deleted' }, (payload) => {
        console.log('Email deleted:', payload);
        setEmails(prev => prev.filter(email => 
          email.gmail_id !== payload.email.gmail_id
        ));
      })
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id]);
  
  const loadEmails = async () => {
    try {
      const response = await fetch('/api/emails');
      const data = await response.json();
      setEmails(data.emails || []);
    } catch (error) {
      console.error('Failed to load emails:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // Request notification permission
  useEffect(() => {
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);
  
  if (loading) {
    return <div className="flex justify-center p-8">Loading emails...</div>;
  }
  
  return (
    <div className="space-y-4">
      {emails.map(email => (
        <EmailItem key={email.gmail_id} email={email} />
      ))}
    </div>
  );
}
```

### 1.6 Update Email API Routes

Modify your email API routes to work with the new database schema:

```javascript
// pages/api/emails/index.js or app/api/emails/route.js
import { createClient } from '@supabase/supabase-js';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;
    
    const { data: emails, error } = await supabase
      .from('gmail_messages')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('is_deleted', false)
      .order('date_received', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (error) throw error;
    
    return Response.json({ emails });
    
  } catch (error) {
    console.error('Failed to fetch emails:', error);
    return Response.json({ error: 'Failed to fetch emails' }, { status: 500 });
  }
}
```

## Step 2: Deploy Cloud Run Worker

### 2.1 Set Environment Variables

```bash
export GOOGLE_CLOUD_PROJECT_ID="your-project-id"
export GOOGLE_CLIENT_ID="your-google-client-id"
export GOOGLE_CLIENT_SECRET="your-google-client-secret"
export NEXTAUTH_URL="https://your-app.vercel.app"
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
export ENCRYPTION_KEY="your-32-character-encryption-key"
```

### 2.2 Deploy to Cloud Run

```bash
cd cloud-run/gmail-pubsub-worker
./deploy.sh
```

### 2.3 Verify Deployment

```bash
# Check service status
gcloud run services describe gmail-pubsub-worker --region us-central1

# Test health endpoint
SERVICE_URL=$(gcloud run services describe gmail-pubsub-worker --platform managed --region us-central1 --format 'value(status.url)')
curl "$SERVICE_URL/health"
```

## Step 3: Set Up Database

### 3.1 Run Database Schema

Execute the schema in your Supabase SQL editor:

```bash
# Copy the schema file content
cat cloud-run/gmail-pubsub-worker/schema.sql
```

Paste and run in Supabase SQL Editor.

### 3.2 Enable Realtime

In Supabase Dashboard:
1. Go to Database → Replication
2. Enable realtime for these tables:
   - `gmail_messages`
   - `gmail_threads`
   - `gmail_sync_status`

## Step 4: Configure Google Cloud

### 4.1 Enable APIs

```bash
gcloud services enable gmail.googleapis.com
gcloud services enable pubsub.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
```

### 4.2 Set Up OAuth Consent

1. Go to Google Cloud Console → APIs & Services → OAuth consent screen
2. Add your domain to authorized domains
3. Add these scopes:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/userinfo.profile`

### 4.3 Configure OAuth Client

1. Go to APIs & Services → Credentials
2. Edit your OAuth 2.0 client
3. Add authorized redirect URIs:
   - `https://your-app.vercel.app/api/auth/callback/google`
   - `https://your-app.vercel.app/api/auth/gmail/callback`

## Step 5: Testing

### 5.1 Test Local Development

```bash
cd cloud-run/gmail-pubsub-worker
./dev-setup.js
npm run dev

# In another terminal
npm run test user@example.com
```

### 5.2 Test Production

1. Connect a Gmail account through your Vercel app
2. Send a test email to that account
3. Check Cloud Run logs:
   ```bash
   gcloud logs tail --service gmail-pubsub-worker
   ```
4. Verify realtime updates in your frontend

## Step 6: Monitoring

### 6.1 Set Up Alerts

```bash
# Create alert policy for Cloud Run errors
gcloud alpha monitoring policies create \
  --policy-from-file=monitoring-policy.yaml
```

### 6.2 Monitor Pub/Sub

```bash
# Check topic metrics
gcloud pubsub topics describe gmail-notifications

# Check subscription metrics
gcloud pubsub subscriptions describe gmail-notifications-sub
```

### 6.3 Database Monitoring

In Supabase Dashboard:
1. Monitor API usage
2. Check realtime connections
3. Review database performance

## Troubleshooting

### Common Issues

1. **401 Errors**: Check OAuth configuration and token encryption
2. **Pub/Sub Not Working**: Verify topic name and push endpoint
3. **Database Errors**: Check RLS policies and service role permissions
4. **Realtime Not Working**: Ensure tables are added to replication

### Debug Commands

```bash
# Check Cloud Run logs
gcloud logs read --service gmail-pubsub-worker --limit 100

# Test Pub/Sub manually
gcloud pubsub topics publish gmail-notifications \
  --message '{"emailAddress":"test@example.com","historyId":"12345"}'

# Check database connections
psql $DATABASE_URL -c "SELECT COUNT(*) FROM gmail_messages;"
```

## Performance Optimization

### Scaling Configuration

- **Cloud Run**: 0-100 instances, 1000 concurrent requests
- **Pub/Sub**: Automatic scaling based on message volume
- **Database**: Connection pooling via Supabase

### Cost Optimization

- Set minimum instances to 0 for cost savings
- Use appropriate memory allocation (1GB recommended)
- Monitor and optimize database queries
- Implement message deduplication

## Security Best Practices

1. **Token Encryption**: All OAuth tokens encrypted at rest
2. **RLS Policies**: Row-level security for all tables
3. **Service Accounts**: Minimal required permissions
4. **Network Security**: Cloud Run allows only authenticated Pub/Sub
5. **Secret Management**: Use Google Cloud Secret Manager

## Next Steps

1. **Add Email Search**: Implement full-text search with database indexes
2. **Batch Processing**: Handle multiple emails in single Pub/Sub message
3. **Attachment Handling**: Store and serve email attachments
4. **Advanced Filtering**: Support for complex email filters
5. **Analytics**: Track email patterns and user engagement

This integration provides a scalable, real-time email synchronization system that can handle millions of users while maintaining cost efficiency and performance.