# Gmail Pub/Sub Architecture Setup Requirements

This guide covers all the accounts, APIs, and credentials needed to implement the Gmail Pub/Sub → Cloud Run → Neon → Vercel architecture for real-time email synchronization.

## 🏗️ Architecture Overview

```
Gmail API → Pub/Sub → Cloud Run Worker → Neon Database → Vercel App
                                    ↓
                              Pusher/Realtime → Frontend Updates
```

## 📋 Required Accounts & Services

### 1. Google Cloud Platform (GCP)

**Account Setup:**
- Create a [Google Cloud Platform account](https://cloud.google.com/)
- Free tier includes $300 credit for 90 days
- Create a new project or use existing one

**Required APIs to Enable:**
```bash
gcloud services enable gmail.googleapis.com
gcloud services enable pubsub.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable secretmanager.googleapis.com
```

**Required Credentials:**
- **OAuth 2.0 Client ID & Secret** (for user authentication)
- **Service Account Key** (for backend worker authentication)
- **Project ID** (for resource identification)

### 2. Neon PostgreSQL Database

**Account Setup:**
- Create a [Neon account](https://neon.tech/)
- Free tier includes 1 database with 512MB storage
- Create a new database project

**Required Information:**
- **Database URL** (connection string)
- **Host, User, Password, Database Name**
- **SSL Mode** (required for production)

### 3. Real-time Service (Choose One)

#### Option A: Pusher (Recommended)
- Create a [Pusher account](https://pusher.com/)
- Free tier: 200k messages/day, 100 concurrent connections
- Create a new Channels app

**Required Credentials:**
- **App ID**
- **Key** (public)
- **Secret** (private)
- **Cluster** (e.g., us3, eu, ap1)

#### Option B: Supabase Realtime
- Use existing Supabase project or create new one
- Built-in realtime functionality with PostgreSQL
- **Required:** Supabase URL and Service Role Key

#### Option C: Ably
- Create an [Ably account](https://ably.com/)
- Free tier: 6M messages/month
- **Required:** API Key

### 4. Vercel

**Account Setup:**
- Create a [Vercel account](https://vercel.com/)
- Free tier includes unlimited deployments
- Connect your GitHub repository

## 🔑 Environment Variables Setup

### Google Cloud Console Setup

#### 1. Create OAuth 2.0 Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **APIs & Services** → **Credentials**
3. Click **Create Credentials** → **OAuth 2.0 Client ID**
4. Choose **Web application**
5. Add authorized redirect URIs:
   ```
   https://your-app.vercel.app/api/auth/callback/google
   https://your-app.vercel.app/api/auth/gmail/callback
   http://localhost:3000/api/auth/callback/google (for development)
   ```
6. Save the **Client ID** and **Client Secret**

#### 2. Create Service Account

1. Go to **IAM & Admin** → **Service Accounts**
2. Click **Create Service Account**
3. Add these roles:
   - **Pub/Sub Admin**
   - **Cloud Run Admin**
   - **Secret Manager Secret Accessor**
4. Create and download the JSON key file

#### 3. Set up OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Choose **External** user type
3. Fill in app information
4. Add your domain to **Authorized domains**
5. Add these scopes:
   ```
   https://www.googleapis.com/auth/gmail.readonly
   https://www.googleapis.com/auth/gmail.modify
   https://www.googleapis.com/auth/userinfo.email
   https://www.googleapis.com/auth/userinfo.profile
   ```

### Neon Database Setup

1. Create a new Neon project
2. Copy the connection string from the dashboard
3. Note down individual connection parameters

### Pusher Setup

1. Create a new Pusher Channels app
2. Choose your preferred cluster (closest to your users)
3. Copy the App ID, Key, Secret, and Cluster from the dashboard

## 📝 Complete Environment Variables

### For Vercel (.env.production)

```bash
# NextAuth Configuration
NEXTAUTH_URL=https://your-app.vercel.app
NEXTAUTH_SECRET=your-nextauth-secret-32-chars-min

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Google Cloud
GOOGLE_CLOUD_PROJECT_ID=your-gcp-project-id
GMAIL_PUBSUB_TOPIC=projects/your-project-id/topics/gmail-notifications

# Database
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require
NEON_DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require

# Pusher (Real-time)
NEXT_PUBLIC_PUSHER_APP_ID=your-pusher-app-id
NEXT_PUBLIC_PUSHER_KEY=your-pusher-key
PUSHER_SECRET=your-pusher-secret
NEXT_PUBLIC_PUSHER_CLUSTER=us3

# Alternative: Supabase Realtime
# NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
# SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Encryption
ENCRYPTION_KEY=your-32-character-encryption-key-here

# Optional: Rate Limiting
UPSTASH_REDIS_REST_URL=your-upstash-redis-url
UPSTASH_REDIS_REST_TOKEN=your-upstash-redis-token
```

### For Cloud Run Worker

```bash
# Google Cloud
GOOGLE_CLOUD_PROJECT_ID=your-gcp-project-id
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_SERVICE_ACCOUNT_KEY='{"type":"service_account",...}'

# Database
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require

# Pusher
PUSHER_APP_ID=your-pusher-app-id
PUSHER_KEY=your-pusher-key
PUSHER_SECRET=your-pusher-secret
PUSHER_CLUSTER=us3

# Encryption
ENCRYPTION_KEY=your-32-character-encryption-key-here

# NextAuth URL (for token validation)
NEXTAUTH_URL=https://your-app.vercel.app
```

## 🚀 Quick Setup Commands

### 1. Set Vercel Environment Variables

```bash
# Google OAuth
npx vercel env add GOOGLE_CLIENT_ID production
npx vercel env add GOOGLE_CLIENT_SECRET production

# Google Cloud
npx vercel env add GOOGLE_CLOUD_PROJECT_ID production
npx vercel env add GMAIL_PUBSUB_TOPIC production

# Database
npx vercel env add DATABASE_URL production

# Pusher
npx vercel env add NEXT_PUBLIC_PUSHER_APP_ID production
npx vercel env add NEXT_PUBLIC_PUSHER_KEY production
npx vercel env add PUSHER_SECRET production
npx vercel env add NEXT_PUBLIC_PUSHER_CLUSTER production

# Security
npx vercel env add NEXTAUTH_SECRET production
npx vercel env add ENCRYPTION_KEY production
```

### 2. Deploy Cloud Run Worker

```bash
cd cloud-run/gmail-pubsub-worker

# Set environment variables
export GOOGLE_CLOUD_PROJECT_ID="your-project-id"
export GOOGLE_CLIENT_ID="your-client-id"
export GOOGLE_CLIENT_SECRET="your-client-secret"
export DATABASE_URL="your-neon-database-url"
export PUSHER_APP_ID="your-pusher-app-id"
export PUSHER_KEY="your-pusher-key"
export PUSHER_SECRET="your-pusher-secret"
export PUSHER_CLUSTER="us3"
export ENCRYPTION_KEY="your-encryption-key"
export NEXTAUTH_URL="https://your-app.vercel.app"

# Deploy
./deploy.sh
```

## 🧪 Testing Setup

### 1. Test Pusher Connection

Create a test HTML file:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Pusher Test</title>
    <script src="https://js.pusher.com/8.4.0/pusher.min.js"></script>
</head>
<body>
    <h1>Pusher Test</h1>
    <div id="messages"></div>
    
    <script>
        Pusher.logToConsole = true;
        
        const pusher = new Pusher('your-pusher-key', {
            cluster: 'us3'
        });
        
        const channel = pusher.subscribe('user_123');
        channel.bind('new_email', function(data) {
            document.getElementById('messages').innerHTML += 
                '<p>New email: ' + JSON.stringify(data) + '</p>';
        });
    </script>
</body>
</html>
```

### 2. Test Backend Pusher Trigger

```javascript
// test-pusher.js
const Pusher = require('pusher');

const pusher = new Pusher({
    appId: 'your-pusher-app-id',
    key: 'your-pusher-key',
    secret: 'your-pusher-secret',
    cluster: 'us3',
    useTLS: true
});

pusher.trigger('user_123', 'new_email', {
    message: 'Test email notification',
    timestamp: new Date().toISOString()
});

console.log('Test message sent!');
```

### 3. Test Database Connection

```javascript
// test-db.js
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function testConnection() {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT NOW()');
        console.log('Database connected:', result.rows[0]);
        client.release();
    } catch (error) {
        console.error('Database connection failed:', error);
    }
}

testConnection();
```

## 🔒 Security Checklist

- [ ] **OAuth Consent Screen** configured with correct domains
- [ ] **Redirect URIs** include both production and development URLs
- [ ] **Service Account** has minimal required permissions
- [ ] **Environment Variables** are encrypted in Vercel
- [ ] **Database** uses SSL connections
- [ ] **API Keys** are not exposed in frontend code
- [ ] **CORS** is properly configured for your domain
- [ ] **Rate Limiting** is implemented for API endpoints

## 💰 Cost Estimates (Free Tiers)

| Service | Free Tier Limits | Estimated Monthly Cost |
|---------|------------------|------------------------|
| **Google Cloud** | $300 credit (90 days) | $0-20 (after credit) |
| **Neon** | 512MB storage | $0 |
| **Pusher** | 200k messages/day | $0 |
| **Vercel** | Unlimited deployments | $0 |
| **Total** | | **$0-20/month** |

## 🆘 Troubleshooting

### Common Issues

1. **OAuth Errors**:
   - Check redirect URIs match exactly
   - Verify domain is added to OAuth consent screen
   - Ensure scopes are correctly configured

2. **Pub/Sub Not Working**:
   - Verify topic name format: `projects/PROJECT_ID/topics/TOPIC_NAME`
   - Check service account permissions
   - Ensure APIs are enabled

3. **Database Connection Issues**:
   - Verify SSL mode is set to `require`
   - Check connection string format
   - Ensure database exists and user has permissions

4. **Pusher Not Connecting**:
   - Verify cluster matches your app configuration
   - Check key vs secret usage (key is public, secret is private)
   - Ensure CORS is configured for your domain

### Debug Commands

```bash
# Test Google Cloud authentication
gcloud auth list
gcloud config get-value project

# Test Pub/Sub
gcloud pubsub topics list
gcloud pubsub subscriptions list

# Test Cloud Run
gcloud run services list
gcloud run services describe gmail-pubsub-worker --region us-central1

# Test database connection
psql $DATABASE_URL -c "SELECT version();"
```

This setup provides a robust, scalable architecture that can handle millions of users while staying within free tier limits during development and testing phases.