# Troubleshooting 500 Internal Server Errors

This guide helps diagnose and fix 500 Internal Server Errors in your deployed InSyte AI Email Assistant.

## Quick Diagnosis

### 1. Check Health Endpoint
First, visit your health check endpoint to get diagnostic information:
```
https://your-app-name.vercel.app/api/health
```

This will show you:
- Database connection status
- Authentication status
- Environment variable presence
- Current configuration

### 2. Check Vercel Function Logs
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Go to "Functions" tab
4. Click on the failing function (e.g., `/api/emails`)
5. Check the "Logs" section for detailed error messages

## Common Issues and Solutions

### Issue 1: Database Connection Errors

**Symptoms:**
- Health endpoint shows `database.status: "failed"`
- Errors mentioning Prisma or database connection

**Solutions:**

1. **Verify DATABASE_URL in Vercel:**
   ```bash
   # Check if DATABASE_URL is set correctly
   # Go to Vercel Dashboard > Project > Settings > Environment Variables
   ```
   
2. **Get correct Supabase connection string:**
   - Go to Supabase Dashboard > Project > Settings > Database
   - Copy the "Connection string" under "Connection pooling"
   - Format: `postgresql://postgres:[password]@[host]:6543/postgres?pgbouncer=true`

3. **Deploy database schema:**
   ```bash
   # Run locally with production DATABASE_URL
   npx prisma db push
   ```

### Issue 2: Authentication Errors

**Symptoms:**
- Health endpoint shows `auth.status: "failed"`
- JWT token errors
- NextAuth errors

**Solutions:**

1. **Set NEXTAUTH_SECRET:**
   ```bash
   # Generate a secret
   openssl rand -base64 32
   # Add to Vercel environment variables
   ```

2. **Set NEXTAUTH_URL:**
   ```
   NEXTAUTH_URL=https://your-app-name.vercel.app
   ```

3. **Configure Google OAuth for production:**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Navigate to APIs & Services > Credentials
   - Edit your OAuth 2.0 Client
   - Add authorized redirect URI:
     ```
     https://your-app-name.vercel.app/api/auth/callback/google
     ```

### Issue 3: Missing Environment Variables

**Symptoms:**
- Health endpoint shows `false` for required environment variables
- API key related errors

**Required Environment Variables:**
```env
# Authentication
NEXTAUTH_SECRET=your-secret-here
NEXTAUTH_URL=https://your-app-name.vercel.app

# Database
DATABASE_URL=postgresql://postgres:[password]@[host]:6543/postgres?pgbouncer=true

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# AI Services
GROQ_API_KEY=your-groq-api-key
GEMINI_API_KEY=your-gemini-api-key

# Optional Services
SERPAPI_API_KEY=your-serpapi-key
ELEVENLABS_API_KEY=your-elevenlabs-key
```

### Issue 4: Vercel Function Timeout

**Symptoms:**
- Functions timing out after 10 seconds
- Large email fetching operations failing

**Solutions:**

1. **Upgrade Vercel plan** for longer function timeouts
2. **Optimize email fetching** by reducing batch sizes
3. **Implement pagination** for large datasets

## Step-by-Step Debugging Process

### Step 1: Check Environment Variables
1. Go to Vercel Dashboard > Your Project > Settings > Environment Variables
2. Verify all required variables are present
3. Check that values don't have extra spaces or quotes
4. Redeploy after making changes

### Step 2: Test Database Connection
1. Visit `/api/health` endpoint
2. If database fails, check Supabase dashboard
3. Verify connection string format
4. Test connection locally:
   ```bash
   # Set production DATABASE_URL locally
   npx prisma studio
   ```

### Step 3: Test Authentication
1. Try logging in to your app
2. Check browser developer tools for auth errors
3. Verify Google OAuth configuration
4. Test with `/api/health` endpoint

### Step 4: Check API Dependencies
1. Verify all API keys are valid
2. Test external services (GROQ, Gemini, etc.)
3. Check rate limits and quotas

## Emergency Fixes

### Quick Database Fix
If database schema is missing:
```bash
# Connect to your production database
export DATABASE_URL="your-supabase-connection-string"
npx prisma db push
```

### Quick Auth Fix
If authentication is broken:
1. Generate new NEXTAUTH_SECRET: `openssl rand -base64 32`
2. Add to Vercel environment variables
3. Redeploy

### Quick Environment Variable Fix
1. Copy from `.env.production.example`
2. Replace placeholder values
3. Add to Vercel Dashboard
4. Redeploy

## Getting Help

If issues persist:
1. Check Vercel function logs for specific error messages
2. Visit `/api/health` for diagnostic information
3. Verify all environment variables are correctly set
4. Ensure database schema is deployed
5. Test authentication flow

## Monitoring

Set up monitoring to prevent future issues:
1. Use Vercel Analytics
2. Set up Sentry for error tracking
3. Monitor database performance in Supabase
4. Set up uptime monitoring