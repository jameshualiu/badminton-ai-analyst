require('dotenv').config();
const Redis = require('ioredis');

/**
 * Shared Redis client for serverless-safe rate limiting.
 *
 * On Vercel each request may hit a fresh, ephemeral function instance, so the
 * default in-memory rate-limit store is per-instance and resets on cold start —
 * making the limits ineffective. Backing the limiter with a shared Redis store
 * (e.g. Upstash, which exposes a standard `rediss://` connection URL) makes the
 * counters consistent across instances.
 *
 * Returns `null` when no REDIS_URL is configured so callers can gracefully fall
 * back to the in-memory store — local dev, docker-compose and CI need no Redis.
 *
 * `lazyConnect` means the constructor opens no socket; the connection is made on
 * the first command, so importing this module is safe even when Redis is absent.
 */
function createRedisClient(env = process.env) {
  const url = env.REDIS_URL;
  if (!url) return null;

  return new Redis(url, {
    lazyConnect: true,
    // Fail fast rather than piling up retries per request; the rate limiter
    // fails open on store errors, so a slow/unreachable Redis shouldn't hang
    // (or take down) the API.
    maxRetriesPerRequest: 1,
    enableAutoPipelining: true,
  });
}

const redisClient = createRedisClient();

module.exports = { createRedisClient, redisClient };
