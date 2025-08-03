# Security Guidelines

## Environment Variables

### Required Environment Variables
Copy `.env.example` to `.env.local` and fill in the actual values:

```bash
cp .env.example .env.local
```

### Security Notes
- **NEVER** commit `.env.local` or any file containing real API keys
- Use strong, unique secrets for `NEXTAUTH_SECRET`
- Rotate API keys regularly
- Use environment-specific configurations for different deployments

## API Security

### Authentication
- All API routes (except `/api/auth/*`) require authentication
- JWT tokens are used for session management
- Middleware automatically validates tokens

### Rate Limiting
- 100 requests per 15-minute window per IP
- Applies to all API routes
- Returns 429 status when limit exceeded

### Input Validation
- All user inputs are validated and sanitized
- Email addresses are validated with regex
- Content length limits are enforced
- Type checking prevents injection attacks

## Security Headers

The following security headers are automatically applied:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- Content Security Policy (CSP)

## Database Security

### Prisma Client
- Singleton pattern prevents connection leaks
- Query logging enabled in development
- Prepared statements prevent SQL injection

### Data Access
- User data is isolated by session
- No direct database access from client-side
- All queries go through authenticated API routes

## Best Practices

### Development
1. Never log sensitive data
2. Use TypeScript for type safety
3. Validate all inputs at API boundaries
4. Handle errors gracefully without exposing internals
5. Keep dependencies updated

### Production
1. Use HTTPS only
2. Set up proper monitoring and alerting
3. Regular security audits
4. Backup encryption keys securely
5. Monitor for suspicious activity

## Incident Response

If you suspect a security breach:
1. Immediately rotate all API keys and secrets
2. Check logs for suspicious activity
3. Update all dependencies
4. Review and update access controls
5. Document the incident and response

## Security Checklist

- [ ] Environment variables are properly configured
- [ ] `.env.local` is in `.gitignore`
- [ ] All API routes have authentication
- [ ] Input validation is implemented
- [ ] Rate limiting is active
- [ ] Security headers are set
- [ ] Dependencies are up to date
- [ ] Error handling doesn't expose sensitive data
- [ ] Logging doesn't include secrets
- [ ] Database queries are parameterized