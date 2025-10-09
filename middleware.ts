import { NextRequest, NextResponse } from 'next/server';
import { generateCSRFToken, verifyCSRFToken, requiresCSRFProtection, CSRF_COOKIE_NAME } from '@/lib/utils/csrf';
// Rate limiting configuration
const RATE_LIMIT_WINDOW_SECONDS = 900; // 15 minutes
const RATE_LIMIT_MAX_REQUESTS = process.env.NODE_ENV === 'development' ? 1000 : 100; // Higher limit for development

// Note: Redis is not used in middleware due to Next.js edge runtime limitations
// Redis caching is handled in API routes via CacheManager

// In-memory store for rate limiting in middleware
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  rateLimitStore.forEach((value, key) => {
    if (now > value.resetTime) {
      rateLimitStore.delete(key);
    }
  });
}, 5 * 60 * 1000);

async function rateLimit(ip: string): Promise<boolean> {
  try {
    // Validate IP address format
    if (!ip || ip === 'unknown' || ip.length > 45) {
      console.warn('Invalid IP address for rate limiting:', ip);
      return false; // Reject invalid IPs
    }
    
    const key = `rate_limit:${ip}`;
    
    // Use in-memory rate limiting
    const now = Date.now();
    const existing = rateLimitStore.get(key);

    if (!existing || now > existing.resetTime) {
      rateLimitStore.set(key, {
        count: 1,
        resetTime: now + (RATE_LIMIT_WINDOW_SECONDS * 1000)
      });
      return true;
    }

    if (existing.count >= RATE_LIMIT_MAX_REQUESTS) {
      return false;
    }

    existing.count++;
    return true;
  } catch (error) {
    console.error('Rate limiting error:', error);
    // Fail securely: reject requests when rate limiting fails
    return false;
  }
}

// Helper function to get client IP
function getClientIP(request: NextRequest): string {
  // Check various headers for client IP (in order of preference)
  const xForwardedFor = request.headers.get('x-forwarded-for');
  const xRealIp = request.headers.get('x-real-ip');
  const cfConnectingIp = request.headers.get('cf-connecting-ip');
  
  if (xForwardedFor) {
    // x-forwarded-for can contain multiple IPs, take the first one
    return xForwardedFor.split(',')[0].trim();
  }
  
  if (xRealIp) {
    return xRealIp.trim();
  }
  
  if (cfConnectingIp) {
    return cfConnectingIp.trim();
  }
  
  // Fallback to request.ip if available
  return request.ip || 'unknown';
}

// Allow-list of API routes that don't require authentication
const PUBLIC_API_ROUTES = [
  '/api/auth/',
  '/api/health',
  '/api/ws',
  // Allow Gmail Pub/Sub webhooks (unauthenticated external source)
  '/api/gmail/webhook',
  // Allow voice synthesis for AI assistant
  '/api/voice/synthesize'
];

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Add security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Content Security Policy: secure for both production and development
  const isProd = process.env.NODE_ENV === 'production';
  
  // Generate nonce for inline scripts if needed (currently unused but kept for future use)
  const nonce = crypto.randomUUID();
  
  const csp = isProd
    ? [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "img-src 'self' data: https:",
        "font-src 'self' https://fonts.gstatic.com data:",
        "connect-src 'self' https: wss:",
        "media-src 'self' blob: data: https:",
        "frame-ancestors 'none'",
        "object-src 'none'",
        "base-uri 'self'",
      ].join('; ')
    : [
        "default-src 'self'",
        "script-src 'self' 'unsafe-eval' 'unsafe-inline'", // Allow inline scripts for development
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", // Keep for dev convenience
        "img-src 'self' data: https:",
        "font-src 'self' https://fonts.gstatic.com data:",
        "connect-src 'self' https: ws: wss:",
        "media-src 'self' blob: data: https:",
        "frame-ancestors 'none'",
        "object-src 'none'",
        "base-uri 'self'",
      ].join('; ');

  response.headers.set('Content-Security-Policy', csp);

  // Rate limiting and request size limits for API routes
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const ip = getClientIP(request);

    // Enforce rough request size limit using Content-Length header when available
    const contentLength = request.headers.get('content-length');
    const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
    if (contentLength && Number(contentLength) > MAX_BYTES) {
      return NextResponse.json(
        { error: 'Payload too large' },
        { status: 413 }
      );
    }

    const allowed = await rateLimit(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429 }
      );
    }
  }

  // Protect API routes using allow-list approach
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const isPublicRoute = PUBLIC_API_ROUTES.some(route => 
      request.nextUrl.pathname.startsWith(route)
    );

    if (!isPublicRoute) {
      try {
        // Check for NextAuth JWT token in cookies (JWT session strategy)
        // Note: We only check for presence here, actual validation happens in the API route
        // Support both default NextAuth cookie name and the app's custom "-v2" name
        const cookieCandidateNames = [
          process.env.NODE_ENV === 'production'
            ? '__Secure-next-auth.session-token'
            : 'next-auth.session-token',
          process.env.NODE_ENV === 'production'
            ? '__Secure-next-auth.session-token-v2'
            : 'next-auth.session-token-v2',
        ];
        const jwtToken = cookieCandidateNames
          .map((name) => request.cookies.get(name)?.value)
          .find(Boolean);
        
        if (!jwtToken) {
          return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
          );
        }

        // CSRF protection for state-changing requests
        if (requiresCSRFProtection(request.method)) {
          if (!verifyCSRFToken(request)) {
            return NextResponse.json(
              { error: 'CSRF token validation failed' },
              { status: 403 }
            );
          }
        }
      } catch (error) {
        console.error('Authentication error:', error);
        return NextResponse.json(
          { error: 'Authentication failed' },
          { status: 401 }
        );
      }
    }
  }

  // Set CSRF token for authenticated requests
  if (!request.cookies.get(CSRF_COOKIE_NAME)) {
    const csrfToken = generateCSRFToken();
    response.cookies.set(CSRF_COOKIE_NAME, csrfToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/'
    });
  }

  return response;
}

export const config = {
  matcher: [
    // Apply to all routes except auth, static files, images, HMR, and websocket endpoint
    '/((?!api/auth|api/ws|_next/static|_next/image|_next/webpack-hmr|favicon.ico).*)',
  ],
};