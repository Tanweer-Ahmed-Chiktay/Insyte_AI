import { NextRequest, NextResponse } from 'next/server';

// Dynamic Redis import to avoid build-time issues
type RedisClientType = any;

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
  private redis: RedisClientType | null = null;
  private redisInitialized = false;
  private memoryStore: Map<string, { count: number; expires: number }> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Only start cleanup in runtime environment (not during build)
    if (typeof window === 'undefined' && process.env.NODE_ENV !== 'test') {
      // Clean up expired memory entries every 5 minutes
      this.cleanupInterval = setInterval(() => this.cleanupMemoryStore(), 5 * 60 * 1000);
    }
  }
  
  private async initRedis(): Promise<void> {
    if (this.redisInitialized) return;
    
    this.redisInitialized = true;
    
    // Only initialize Redis if URL is available
    if (process.env.REDIS_URL && 
        process.env.REDIS_URL !== 'your-redis-url' &&
        typeof window === 'undefined') { // Only in server environment
      try {
        // Dynamic import to avoid build-time issues
        const { createClient } = await import('redis');
        this.redis = createClient({
          url: process.env.REDIS_URL,
        });
        
        this.redis.on('error', (err: any) => {
          console.warn('Redis client error in rate limiter:', err);
        });
        
        // Connect to Redis
        await this.redis.connect();
      } catch (error) {
        console.warn('Failed to initialize Redis in rate limiter, using memory store:', error);
        this.redis = null;
      }
    }
  }
  
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

    // Initialize Redis if needed
    await this.initRedis();

    if (this.redis) {
      try {
        // Use Redis for rate limiting
        const current = await this.redis.get(windowKey);
        
        if (current === null) {
          await this.redis.setEx(windowKey, window, '1');
          count = 1;
        } else {
          count = await this.redis.incr(windowKey);
        }
      } catch (error) {
        console.warn('Redis rate limit check failed, falling back to memory store:', error);
        // Fall back to memory store
        count = this.checkMemoryStore(windowKey, window, now + (window * 1000));
      }
    } else {
      // Use memory store
      count = this.checkMemoryStore(windowKey, window, now + (window * 1000));
    }

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
    
    // Initialize Redis if needed
    await this.initRedis();
    
    if (this.redis) {
      try {
        const keys = await this.redis.keys(`${key}:*`);
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      } catch (error) {
        console.error('Rate limit reset error:', error);
      }
    }
    
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