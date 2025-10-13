// Redis removed: memory-only cache manager

interface CacheOptions {
  ttl?: number; // Time to live in seconds
  prefix?: string;
}

export class CacheManager {
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
  // No Redis initialization; memory-only

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
  }

  async invalidate(pattern: string): Promise<void> {
    const fullPattern = this.getKey(pattern);
    
    // Clear from memory cache
    for (const key of Array.from(this.memoryCache.keys())) {
      if (key.includes(pattern)) {
        this.memoryCache.delete(key);
      }
    }
  }

  async invalidateKey(key: string): Promise<void> {
    const fullKey = this.getKey(key);
    
    // Clear from memory cache
    this.memoryCache.delete(fullKey);
  }

  async exists(key: string): Promise<boolean> {
    const fullKey = this.getKey(key);
    
    // Check memory cache first
    const memoryItem = this.memoryCache.get(fullKey);
    if (memoryItem && memoryItem.expires > Date.now()) {
      return true;
    }
    
    return false;
  }

  async increment(key: string, amount: number = 1): Promise<number> {
    const fullKey = this.getKey(key);
    
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
    
    // No Redis: memory-only
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
      // No Redis: return null if not in memory
      results.push(null);
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