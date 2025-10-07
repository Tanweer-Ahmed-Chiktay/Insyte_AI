# Deployment Guide for InSyte AI Email Assistant

This guide will help you deploy the InSyte application online using Vercel for hosting and Supabase for the database.

## Prerequisites

- Node.js 18+ installed
- Git repository (already set up)
- Vercel account
- Supabase account
- Google Cloud Console account (for OAuth)

## Step 1: Set up Supabase Database

1. **Create a Supabase Project**
   - Go to [supabase.com](https://supabase.com)
   - Click "Start your project"
   - Create a new organization if needed
   - Create a new project
   - Choose a region close to your users
   - Set a strong database password

2. **Get Database Connection String**
   - Go to Project Settings → Database
   - Copy the connection string under "Connection string"
   - It should look like: `postgresql://postgres:[YOUR-PASSWORD]@[PROJECT-REF].supabase.co:5432/postgres`

3. **Configure Database Access**
   - Go to Authentication → Settings
   - Disable "Enable email confirmations" for easier setup (optional)
   - Note your project URL and anon key for later

## Step 2: Update Environment Variables

Create a `.env.local` file with production values:

```env
# NextAuth Configuration
NEXTAUTH_URL=https://your-app-name.vercel.app
NEXTAUTH_SECRET=your-super-secret-nextauth-secret-here

# Supabase Database
DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@[PROJECT-REF].supabase.co:5432/postgres"

# Google OAuth (update with production URLs)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# AI Services
GROQ_API_KEY=your-groq-api-key
GEMINI_API_KEY=your-gemini-api-key

# Web Search
SERPAPI_API_KEY=your-serpapi-key

# Voice Assistant
ELEVENLABS_API_KEY=your-elevenlabs-api-key
```

## Step 3: Configure Google OAuth for Production

1. **Update Google Cloud Console**
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Navigate to APIs & Services → Credentials
   - Edit your OAuth 2.0 Client ID
   - Add authorized redirect URIs:
     - `https://your-app-name.vercel.app/api/auth/callback/google`
   - Add authorized JavaScript origins:
     - `https://your-app-name.vercel.app`

## Step 4: Deploy to Vercel

1. **Install Vercel CLI** (optional)
   ```bash
   npm i -g vercel
   ```

2. **Deploy via GitHub Integration** (Recommended)
   - Go to [vercel.com](https://vercel.com)
   - Click "New Project"
   - Import your GitHub repository
   - Configure project settings:
     - Framework Preset: Next.js
     - Build Command: `npm run build`
     - Output Directory: `.next`
     - Install Command: `npm install`

3. **Set Environment Variables in Vercel**
   - In your Vercel project dashboard
   - Go to Settings → Environment Variables
   - Add all the variables from your `.env.local` file
   - Make sure to set them for Production, Preview, and Development environments

## Step 5: Run Database Migrations

1. **Generate Prisma Client**
   ```bash
   npx prisma generate
   ```

2. **Push Database Schema to Supabase**
   ```bash
   npx prisma db push
   ```

   Or if you prefer migrations:
   ```bash
   npx prisma migrate deploy
   ```

## Step 6: Deploy and Test

1. **Trigger Deployment**
   - Push your changes to the main branch
   - Vercel will automatically deploy
   - Or use `vercel --prod` if using CLI

2. **Test the Application**
   - Visit your deployed URL
   - Test Google OAuth login
   - Verify database connections
   - Test email functionality

## Alternative: Deploy to Render

If you prefer Render as an alternative to Vercel:

1. **Create Render Account**
   - Go to [render.com](https://render.com)
   - Connect your GitHub account

2. **Create Web Service**
   - Click "New" → "Web Service"
   - Connect your repository
   - Configure:
     - Environment: Node
     - Build Command: `npm install && npm run build`
     - Start Command: `npm start`

3. **Set Environment Variables**
   - Add all environment variables in Render dashboard
   - Update `NEXTAUTH_URL` to your Render URL

## Troubleshooting

### Common Issues:

1. **Database Connection Errors**
   - Verify DATABASE_URL is correct
   - Check Supabase project is active
   - Ensure database password is correct

2. **OAuth Errors**
   - Verify Google OAuth redirect URIs
   - Check NEXTAUTH_URL matches your domain
   - Ensure NEXTAUTH_SECRET is set

3. **Build Errors**
   - Check all environment variables are set
   - Verify Node.js version compatibility
   - Review build logs in Vercel/Render

4. **API Errors**
   - Verify all API keys are valid
   - Check API rate limits
   - Review function timeout settings

## Security Considerations

1. **Environment Variables**
   - Never commit `.env` files to Git
   - Use strong, unique secrets
   - Rotate API keys regularly

2. **Database Security**
   - Enable Row Level Security in Supabase
   - Use connection pooling for better performance
   - Regular database backups

3. **OAuth Security**
   - Use HTTPS only in production
   - Verify redirect URIs are correct
   - Monitor OAuth usage

## Performance Optimization

1. **Vercel Configuration**
   - Use appropriate regions
   - Configure function timeouts
   - Enable caching where appropriate

2. **Database Optimization**
   - Use database indexes
   - Implement connection pooling
   - Monitor query performance

3. **API Optimization**
   - Implement rate limiting
   - Use caching for expensive operations
   - Optimize API response sizes

## Monitoring and Maintenance

1. **Set up Monitoring**
   - Use Vercel Analytics
   - Monitor Supabase metrics
   - Set up error tracking (Sentry)

2. **Regular Maintenance**
   - Update dependencies
   - Monitor API usage
   - Review security logs
   - Backup database regularly

Your InSyte AI Email Assistant should now be successfully deployed and accessible online!