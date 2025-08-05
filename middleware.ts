import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

// Rate limiting store (in production, use Redis or similar)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

// Rate limiting configuration
const RATE_LIMIT_WINDOW = 15 * 60 * 1000 // 15 minutes
const RATE_LIMIT_MAX_REQUESTS = 100 // requests per window

function rateLimit(ip: string): boolean {
  const now = Date.now()
  const userLimit = rateLimitStore.get(ip)

  if (!userLimit || now > userLimit.resetTime) {
    rateLimitStore.set(ip, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW
    })
    return true
  }

  if (userLimit.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false
  }

  userLimit.count++
  return true
}

export async function middleware(request: NextRequest) {
  const response = NextResponse.next()

  // Add security headers
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  // Relaxed CSP for development - allows localhost connections and data URLs
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' data: https: http://localhost:* ws://localhost:*; media-src 'self' blob:;"
  )

  // Rate limiting for API routes
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const ip = request.ip || request.headers.get('x-forwarded-for') || 'unknown'
    
    if (!rateLimit(ip)) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429 }
      )
    }
  }

  // Protect API routes (except auth routes and routes that use getServerSession)
  if (
    request.nextUrl.pathname.startsWith('/api/') &&
    !request.nextUrl.pathname.startsWith('/api/auth/') &&
    !request.nextUrl.pathname.startsWith('/api/emails') &&
    !request.nextUrl.pathname.startsWith('/api/ai/') &&
    !request.nextUrl.pathname.startsWith('/api/voice/') &&
    !request.nextUrl.pathname.startsWith('/api/health')
  ) {
    // Cast request to any for Next.js 14+ compatibility
    const token = await getToken({
      req: request as any,
      secret: process.env.NEXTAUTH_SECRET
    })

    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
  }

  return response
}

export const config = {
  matcher: [
    // Apply to all routes except auth, static files, and images
    '/((?!api/auth|_next/static|_next/image|favicon.ico).*)',
  ],
}