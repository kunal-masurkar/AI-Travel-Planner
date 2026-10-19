import { Redis } from "ioredis";

const redisUrl = process.env.REDIS_URL?.trim();

let client: Redis | null = null;

if (redisUrl) {
  try {
    // Normalise scheme: if given redis://... but requires TLS, ensure rediss:// or tls options
    const url = redisUrl.startsWith("redis://") && redisUrl.includes(".upstash.io")
      ? redisUrl.replace(/^redis:\/\//, "rediss://")
      : redisUrl;

    client = new Redis(url, {
      maxRetriesPerRequest: 2,
      lazyConnect: false,
      connectTimeout: 5000,
      retryStrategy(times) {
        if (times > 3) {
          console.warn("[Redis] Maximum reconnection attempts reached, giving up for now.");
          return null;
        }
        return Math.min(times * 500, 2000);
      },
    });

    client.on("connect", () => {
      console.log("[Redis] Connected to Upstash Redis successfully.");
    });

    client.on("error", (err) => {
      console.warn("[Redis] Connection error:", err.message);
    });
  } catch (err) {
    console.warn("[Redis] Failed to initialize Redis client:", err);
    client = null;
  }
}

export const redis = client;

// In-memory fallback if Redis is unavailable or unconfigured
const memoryHits = new Map<string, { count: number; resetAt: number }>();

/**
 * Atomic sliding/fixed-window rate limiter using Redis INCR + EXPIRE.
 * Falls back to in-memory map if Redis is not configured or offline.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ allowed: boolean; remaining: number; count: number; resetAt: number }> {
  const now = Date.now();
  const windowSec = Math.ceil(windowMs / 1000);

  if (redis && redis.status === "ready") {
    try {
      const redisKey = `ratelimit:${key}`;
      // Atomic pipeline: INCR and TTL
      const results = await redis
        .pipeline()
        .incr(redisKey)
        .ttl(redisKey)
        .exec();

      if (results && results[0] && !results[0][0]) {
        const count = results[0][1] as number;
        let ttl = (results[1]?.[1] as number) ?? -1;

        // Set expiry if first hit or no TTL set
        if (ttl === -1 || count === 1) {
          await redis.expire(redisKey, windowSec);
          ttl = windowSec;
        }

        const resetAt = now + Math.max(ttl, 1) * 1000;
        const allowed = count <= limit;
        const remaining = Math.max(0, limit - count);

        return { allowed, remaining, count, resetAt };
      }
    } catch (err) {
      console.warn("[Redis] Rate limit query failed, falling back to memory:", err);
    }
  }

  // In-memory fallback
  const entry = memoryHits.get(key);
  if (!entry || entry.resetAt <= now) {
    memoryHits.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, count: 1, resetAt: now + windowMs };
  }

  entry.count += 1;
  const allowed = entry.count <= limit;
  const remaining = Math.max(0, limit - entry.count);
  return { allowed, remaining, count: entry.count, resetAt: entry.resetAt };
}
