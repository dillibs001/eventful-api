import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';

// Wraps ThrottlerStorageRedisService so a Redis outage degrades gracefully
// (requests are allowed through) instead of returning 500 on every route.
export class ResilientThrottlerStorage extends ThrottlerStorageRedisService {
  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ) {
    try {
      return await super.increment(key, ttl, limit, blockDuration, throttlerName);
    } catch {
      // Redis unreachable — let the request through rather than hard-failing.
      return { totalHits: 1, timeToExpire: ttl, isBlocked: false, timeToBlockExpire: 0 };
    }
  }
}
