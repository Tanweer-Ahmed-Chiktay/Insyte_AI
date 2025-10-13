import { NextRequest, NextResponse } from 'next/server';

interface RateLimitOptions {
  requests: number;
  window: number; // in seconds
  keyGenerator?: (req: NextRequest) => string;
}

interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
  retryAfter?: number;
}

class RateLimiter {
  private memoryStore: Map<string, { count: number; expires: number }> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Only start cleanup in runtime environment (not during build)
    if (typeof window === 'undefined' && process.env.NODE_ENV !== 'test') {
      // Clean up expired memory entries every 5 minutes
      this.cleanupInterval = setInterval(() => this.cleanupMemoryStore(), 5 * 60 * 1000);
    }
  }
  
  // Redis fully removed: memory-only rate limiting
  
  private cleanupMemoryStore(): void {
    const now = Date.now();
    const entries = Array.from(this.memoryStore.entries());
    for (const [key, entry] of entries) {
      if (now > entry.expires) {
        this.memoryStore.delete(key);
      }
    }
  }

  async check(
    identifier: string,
    options: RateLimitOptions
  ): Promise<RateLimitResult> {
    const { requests, window } = options;
    const key = `rate_limit:${identifier}`;
    const now = Date.now();
    const windowStart = Math.floor(now / (window * 1000)) * (window * 1000);
    const windowKey = `${key}:${windowStart}`;

    let count = 0;
    // Use memory store only
    count = this.checkMemoryStore(windowKey, window, now + window * 1000);

    const remaining = Math.max(0, requests - count);
    const reset = windowStart + (window * 1000);
    const success = count <= requests;

    const result: RateLimitResult = {
      success,
      limit: requests,
      remaining,
      reset,
    };

    if (!success) {
      result.retryAfter = Math.ceil((reset - now) / 1000);
    }

    return result;
  }
  
  private checkMemoryStore(key: string, window: number, expires: number): number {
    const existing = this.memoryStore.get(key);
    
    if (!existing || Date.now() > existing.expires) {
      this.memoryStore.set(key, { count: 1, expires });
      return 1;
    }
    
    existing.count++;
    return existing.count;
  }

  async reset(identifier: string): Promise<void> {
    const key = `rate_limit:${identifier}`;

    // Also clear from memory store
    const entries = Array.from(this.memoryStore.entries());
    for (const [memKey] of entries) {
      if (memKey.startsWith(key)) {
        this.memoryStore.delete(memKey);
      }
    }
  }
}

const rateLimiter = new RateLimiter();

// Default key generator using IP and pathname
function defaultKeyGenerator(req: NextRequest): string {
  const ip = req.ip || req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
  const pathname = new URL(req.url).pathname;
  return `${ip}:${pathname}`;
}

// Rate limit middleware factory
export function rateLimit(options: RateLimitOptions) {
  return async function rateLimitMiddleware(
    req: NextRequest
  ): Promise<NextResponse | null> {
    const keyGenerator = options.keyGenerator || defaultKeyGenerator;
    const identifier = keyGenerator(req);
    
    const result = await rateLimiter.check(identifier, options);
    
    if (!result.success) {
      return new NextResponse(
        JSON.stringify({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded',
          retryAfter: result.retryAfter,
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'X-RateLimit-Limit': result.limit.toString(),
            'X-RateLimit-Remaining': result.remaining.toString(),
            'X-RateLimit-Reset': result.reset.toString(),
            'Retry-After': result.retryAfter?.toString() || '60',
          },
        }
      );
    }
    
    // Add rate limit headers to successful responses
    const response = NextResponse.next();
    response.headers.set('X-RateLimit-Limit', result.limit.toString());
    response.headers.set('X-RateLimit-Remaining', result.remaining.toString());
    response.headers.set('X-RateLimit-Reset', result.reset.toString());
    
    return null; // Continue to next middleware/handler
  };
}

// Predefined rate limiters for common use cases
export const apiRateLimit = rateLimit({
  requests: 100,
  window: 60, // 100 requests per minute
});

export const authRateLimit = rateLimit({
  requests: 5,
  window: 60, // 5 requests per minute for auth endpoints
});

export const emailRateLimit = rateLimit({
  requests: 50,
  window: 60, // 50 requests per minute for email operations
});

export const calendarRateLimit = rateLimit({
  requests: 30,
  window: 60, // 30 requests per minute for calendar operations
});

// Utility function to apply rate limiting to API routes
export async function withRateLimit(
  req: NextRequest,
  options: RateLimitOptions,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  const rateLimitResponse = await rateLimit(options)(req);
  
  if (rateLimitResponse) {
    return rateLimitResponse;
  }
  
  return handler();
}

// Export the rate limiter instance for direct use
export { rateLimiter };