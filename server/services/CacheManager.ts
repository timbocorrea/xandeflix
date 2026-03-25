export class CacheManager<T> {
  private cache = new Map<string, { data: T, timestamp: number }>();
  private defaultTtl: number;

  constructor(ttlMinutes: number = 30) {
    this.defaultTtl = ttlMinutes * 60 * 1000;
  }

  /**
   * Gets a value from the cache if it hasn't expired
   */
  public get(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) return null;
    
    const isExpired = (Date.now() - entry.timestamp) > this.defaultTtl;
    
    if (isExpired) {
      this.cache.delete(key);
      return null;
    }
    
    console.log(`[CACHE] Serving content for key: ${key.substring(0, 50)}...`);
    return entry.data;
  }

  /**
   * Sets a value in the cache with a timestamp
   */
  public set(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
    
    // Simple cleanup of old entries
    if (this.cache.size > 100) {
      const now = Date.now();
      for (const [k, v] of this.cache.entries()) {
        if (now - v.timestamp > this.defaultTtl) {
          this.cache.delete(k);
        }
      }
    }
  }

  /**
   * Clears the entire cache
   */
  public clear(): void {
    this.cache.clear();
  }
}
