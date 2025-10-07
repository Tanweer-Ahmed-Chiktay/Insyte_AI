// Dynamic Redis import to avoid build-time issues
type RedisClientType = any;

interface CacheOptions {
  ttl?: number; // Time to live in seconds
  prefix?: string;
}

export class CacheManager {
  private redis: RedisClientType | null = null;
  private redisInitialized = false;
  private memoryCache: Map<string, { value: any; expires: number }> = new Map();
  private defaultTTL = 3600; // 1 hour
  private prefix: string;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(options: CacheOptions = {}) {
    this.defaultTTL = options.ttl || 3600;
    this.prefix = options.prefix || 'insyte:';
    
    // Only start cleanup in runtime environment (not during build)
    if (typeof window === 'undefined' && process.env.NODE_ENV !== 'test') {
      // Clean up expired memory cache entries every 5 minutes
      this.cleanupInterval = setInterval(() => this.cleanupMemoryCache(), 5 * 60 * 1000);
    }
  }
  
  private async initRedis(): Promise<void> {
    if (this.redisInitialized) return;
    
    this.redisInitialized = true;
    
    // Only initialize Redis if URL is available and valid
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
          console.warn('Redis client error:', err);
        });
        
        // Connect to Redis
        await this.redis.connect();
      } catch (error) {
        console.warn('Failed to initialize Redis, falling back to memory cache:', error);
        this.redis = null;
      }
    }
  }

  private getKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  async get<T>(key: string): Promise<T | null> {
    const fullKey = this.getKey(key);
    
    // Try memory cache first
    const memoryItem = this.memoryCache.get(fullKey);
    if (memoryItem && memoryItem.expires > Date.now()) {
      return memoryItem.value as T;
    }
    
    // Remove expired memory cache item
    if (memoryItem) {
      this.memoryCache.delete(fullKey);
    }
    
    // Initialize Redis if needed
    await this.initRedis();
    
    // Try Redis cache if available
    if (this.redis) {
      try {
        const redisValue = await this.redis.get(fullKey);
        if (redisValue !== null) {
          const parsedValue = JSON.parse(redisValue);
          // Store in memory cache for faster access
          this.memoryCache.set(fullKey, {
            value: parsedValue,
            expires: Date.now() + (60 * 1000), // 1 minute in memory
          });
          return parsedValue as T;
        }
      } catch (error) {
        console.warn('Redis get failed, using memory cache only:', error);
      }
    }
    
    return null;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const fullKey = this.getKey(key);
    const cacheTTL = ttl || this.defaultTTL;
    
    // Store in memory cache
    this.memoryCache.set(fullKey, {
      value,
      expires: Date.now() + Math.min(cacheTTL * 1000, 60 * 1000), // Max 1 minute in memory
    });
    
    // Initialize Redis if needed
    await this.initRedis();
    
    // Store in Redis with TTL if available
    if (this.redis) {
      try {
        await this.redis.setEx(fullKey, cacheTTL, JSON.stringify(value));
      } catch (error) {
        console.error('Redis set error:', error);
      }
    }
  }

  async invalidate(pattern: string): Promise<void> {
    const fullPattern = this.getKey(pattern);
    
    // Clear from memory cache
    for (const key of Array.from(this.memoryCache.keys())) {
      if (key.includes(pattern)) {
        this.memoryCache.delete(key);
      }
    }
    
    // Clear from Redis if available
    if (this.redis) {
      try {
        // Get all keys matching pattern from Redis
        const keys = await this.redis.keys(fullPattern);
        if (keys.length > 0) {
          await this.redis.del(keys);
        }
      } catch (error) {
        console.error('Redis invalidate error:', error);
      }
    }
  }

  async invalidateKey(key: string): Promise<void> {
    const fullKey = this.getKey(key);
    
    // Clear from memory cache
    this.memoryCache.delete(fullKey);
    
    // Clear from Redis if available
    if (this.redis) {
      try {
        await this.redis.del(fullKey);
      } catch (error) {
        console.error('Redis delete error:', error);
      }
    }
  }

  async exists(key: string): Promise<boolean> {
    const fullKey = this.getKey(key);
    
    // Check memory cache first
    const memoryItem = this.memoryCache.get(fullKey);
    if (memoryItem && memoryItem.expires > Date.now()) {
      return true;
    }
    
    // Check Redis if available
    if (this.redis) {
      try {
        const exists = await this.redis.exists(fullKey);
        return exists === 1;
      } catch (error) {
        console.error('Redis exists error:', error);
      }
    }
    
    return false;
  }

  async increment(key: string, amount: number = 1): Promise<number> {
    const fullKey = this.getKey(key);
    
    // Use Redis if available
    if (this.redis) {
      try {
        return await this.redis.incrBy(fullKey, amount);
      } catch (error) {
        console.error('Redis increment error:', error);
      }
    }
    
    // Fallback to memory cache
    const current = this.memoryCache.get(fullKey);
    const newValue = (current?.value || 0) + amount;
    this.memoryCache.set(fullKey, {
      value: newValue,
      expires: Date.now() + (this.defaultTTL * 1000)
    });
    return newValue;
  }

  async setWithExpiry(key: string, value: any, expiryMs: number): Promise<void> {
    const fullKey = this.getKey(key);
    
    // Store in memory cache
    this.memoryCache.set(fullKey, {
      value,
      expires: Date.now() + Math.min(expiryMs, 60 * 1000), // Max 1 minute in memory
    });
    
    try {
      // Store in Redis with expiry
      await this.redis.psetex(fullKey, expiryMs, JSON.stringify(value));
    } catch (error) {
      console.error('Redis setex error:', error);
    }
  }

  private cleanupMemoryCache(): void {
    const now = Date.now();
    for (const [key, item] of Array.from(this.memoryCache.entries())) {
      if (item.expires <= now) {
        this.memoryCache.delete(key);
      }
    }
  }

  // Utility methods for common cache patterns
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }
    
    const value = await fetcher();
    await this.set(key, value, ttl);
    return value;
  }

  async remember<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    return this.getOrSet(key, fetcher, ttl);
  }

  // Batch operations
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    const fullKeys = keys.map(key => this.getKey(key));
    const results: (T | null)[] = [];
    
    for (const fullKey of fullKeys) {
      // Check memory cache first
      const memoryItem = this.memoryCache.get(fullKey);
      if (memoryItem && memoryItem.expires > Date.now()) {
        results.push(memoryItem.value as T);
        continue;
      }
      
      try {
        const redisValue = await this.redis.get(fullKey);
        results.push(redisValue as T);
      } catch (error) {
        console.error('Redis mget error:', error);
        results.push(null);
      }
    }
    
    return results;
  }

  async mset(keyValuePairs: Array<{ key: string; value: any; ttl?: number }>): Promise<void> {
    for (const { key, value, ttl } of keyValuePairs) {
      await this.set(key, value, ttl);
    }
  }
}

// Singleton instance
export const cacheManager = new CacheManager();