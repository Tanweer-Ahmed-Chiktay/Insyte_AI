# Fixing Database Connection Issues (Prepared Statement Errors)

This guide specifically addresses the "prepared statement does not exist" errors (PostgreSQL code 26000) that occur in serverless environments.

## Problem Description

You're seeing errors like:
```
PrismaClientUnknownRequestError: Invalid `prisma.email.findFirst()` invocation:
Error occurred during query execution: ConnectorError(ConnectorError { 
  user_facing_error: None, 
  kind: QueryError(PostgresError { 
    code: "26000", 
    message: "prepared statement \"s247\" does not exist", 
    severity: "ERROR" 
  })
})
```

## Root Cause

Serverless functions (like Vercel) don't maintain persistent database connections. When Prisma tries to reuse prepared statements from a previous connection that no longer exists, PostgreSQL returns the "26000" error.

## Solution Steps

### Step 1: Update DATABASE_URL for Connection Pooling

1. **Go to your Supabase Dashboard:**
   - Navigate to Project Settings → Database
   - Find the "Connection pooling" section
   - Copy the connection string that uses port **6543** (not 5432)

2. **Update your Vercel Environment Variables:**
   - Go to Vercel Dashboard → Your Project → Settings → Environment Variables
   - Update `DATABASE_URL` to use the pooled connection:
   ```
   postgresql://postgres:[YOUR-PASSWORD]@[PROJECT-REF].supabase.co:6543/postgres?pgbouncer=true&connection_limit=1
   ```

3. **Key differences:**
   - Port: `6543` (pooled) instead of `5432` (direct)
   - Parameters: `?pgbouncer=true&connection_limit=1`

### Step 2: Verify Schema Deployment

1. **Ensure your database schema is deployed:**
   - Copy the entire content of `supabase-schema.sql`
   - Go to Supabase Dashboard → SQL Editor
   - Paste and run the schema

2. **The schema includes `DROP TABLE IF EXISTS` statements to handle existing tables safely**

### Step 3: Redeploy Your Application

1. **Trigger a new deployment:**
   ```bash
   # Make a small change to trigger redeploy
   git commit --allow-empty -m "Fix database connection pooling"
   git push
   ```

2. **Or redeploy manually in Vercel Dashboard**

### Step 4: Test the Fix

1. **Check the health endpoint:**
   ```
   https://your-app-name.vercel.app/api/health
   ```
   - Should show `database.status: "connected"`
   - No prepared statement error messages

2. **Test the problematic endpoints:**
   - `/api/emails`
   - `/api/ai/summarize`
   - `/api/chat`

## Alternative Solutions

### If Connection Pooling Doesn't Work

Some environments may have issues with pgbouncer. Try the direct connection with retry logic:

```
DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@[PROJECT-REF].supabase.co:5432/postgres?connect_timeout=60&pool_timeout=60&sslmode=require"
```

### Manual Connection Management

The codebase now includes a `PrismaWrapper` class that automatically retries failed operations. This handles temporary connection issues gracefully.

## Monitoring

### Check Vercel Function Logs

1. Go to Vercel Dashboard → Functions
2. Click on failing functions
3. Check logs for:
   - Successful database connections
   - Reduced error rates
   - No more "26000" errors

### Supabase Monitoring

1. Go to Supabase Dashboard → Reports
2. Monitor:
   - Connection count
   - Query performance
   - Error rates

## Prevention

### Best Practices for Serverless Databases

1. **Always use connection pooling** in serverless environments
2. **Implement retry logic** for transient connection issues
3. **Monitor connection limits** to avoid exhausting the pool
4. **Use shorter connection timeouts** to release connections quickly

### Environment-Specific Configuration

- **Development:** Direct connection (port 5432) is fine
- **Production:** Always use pooled connection (port 6543)
- **Staging:** Use pooled connection to match production

## Troubleshooting

### If Errors Persist

1. **Verify the DATABASE_URL format:**
   ```bash
   # Should include pgbouncer=true and port 6543
   echo $DATABASE_URL
   ```

2. **Check Supabase connection limits:**
   - Free tier: 60 connections
   - Pro tier: 200 connections
   - Ensure you're not exceeding limits

3. **Test connection locally:**
   ```bash
   # Set production DATABASE_URL locally
   npx prisma studio
   ```

4. **Check for schema mismatches:**
   ```bash
   npx prisma db pull
   npx prisma generate
   ```

### Common Mistakes

- Using port 5432 instead of 6543 for production
- Missing `pgbouncer=true` parameter
- Not redeploying after changing environment variables
- Schema not deployed to production database

## Success Indicators

✅ Health endpoint shows database connected
✅ No "26000" errors in Vercel logs
✅ API endpoints responding successfully
✅ Reduced 500 error rates
✅ Stable application performance

## Need Help?

If you're still experiencing issues:

1. Check the health endpoint for specific error messages
2. Review Vercel function logs for detailed error information
3. Verify all environment variables are correctly set
4. Ensure the database schema is properly deployed