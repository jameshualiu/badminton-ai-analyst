const { rateLimit } = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { redisClient } = require('../config/redis');
const logger = require('../utils/logger');

/**
 * Wraps a rate-limit store so a Redis outage fails **open** (allows the request)
 * instead of erroring every API call. Serverless correctness shouldn't come at
 * the cost of a transient Redis blip taking the whole API down — a brief window
 * of unenforced limits is preferable to a hard 500 on every request.
 */
class FailOpenStore {
  constructor(inner) {
    this.inner = inner;
    // express-rate-limit reads localKeys to decide key prefixing; forward it.
    this.localKeys = inner.localKeys;
  }

  init(options) {
    if (typeof this.inner.init === 'function') this.inner.init(options);
  }

  async increment(key) {
    try {
      return await this.inner.increment(key);
    } catch (err) {
      logger.error({ err, key }, 'Rate-limit store increment failed; failing open');
      // 0 hits is under any configured max, so the request is allowed through.
      return { totalHits: 0, resetTime: undefined };
    }
  }

  async decrement(key) {
    try {
      await this.inner.decrement(key);
    } catch (err) {
      logger.error({ err, key }, 'Rate-limit store decrement failed; ignoring');
    }
  }

  async resetKey(key) {
    try {
      await this.inner.resetKey(key);
    } catch (err) {
      logger.error({ err, key }, 'Rate-limit store resetKey failed; ignoring');
    }
  }

  async resetAll() {
    if (typeof this.inner.resetAll !== 'function') return;
    try {
      await this.inner.resetAll();
    } catch (err) {
      logger.error({ err }, 'Rate-limit store resetAll failed; ignoring');
    }
  }
}

/**
 * Builds the store for a limiter. Returns `undefined` when no Redis client is
 * available, which makes express-rate-limit use its default in-memory store
 * (fine for local/single-instance use). With a client, returns a Redis-backed
 * store — namespaced by `prefix` so the two limiters don't share counters —
 * wrapped so Redis errors fail open.
 */
/**
 * Adapter from rate-limit-redis' `sendCommand(...tokens)` contract to ioredis.
 * ioredis' `.call()` takes the same variadic command tokens and returns the raw
 * reply, so this is a straight forward.
 */
function sendCommandFor(client) {
  return (...args) => client.call(...args);
}

function buildStore(client, prefix) {
  if (!client) return undefined;
  const store = new RedisStore({
    prefix,
    sendCommand: sendCommandFor(client),
  });
  return new FailOpenStore(store);
}

/**
 * Global Rate Limiter
 *
 * This protects your entire API from general "noise" and basic bots.
 * 100 requests in 15 minutes is plenty for a normal human browsing your dashboard.
 */
const globalLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 100,
	message: {
        status: 429,
        message: 'Too many requests from this IP, please try again after 15 minutes'
    },
	standardHeaders: 'draft-7',
	legacyHeaders: false,
	store: buildStore(redisClient, 'rl:global:'),
});

/**
 * Strict Limiter for Sensitive Routes (Updated to 5 per 30 mins)
 *
 * Real-world context: Each video upload triggers an S3 pre-signed URL and
 * prepares your database. We limit this to 5 per 30 minutes so that a single
 * user can't accidentally (or maliciously) trigger hundreds of expensive
 * cloud operations.
 */
const uploadLimiter = rateLimit({
	windowMs: 30 * 60 * 1000, // 30 minutes
	max: 10,
	message: {
        status: 429,
        message: 'Too many upload attempts. Please wait 30 minutes before trying again.'
    },
	standardHeaders: 'draft-7',
	legacyHeaders: false,
	store: buildStore(redisClient, 'rl:upload:'),
});

module.exports = {
    globalLimiter,
    uploadLimiter,
    buildStore,
    sendCommandFor,
    FailOpenStore,
};
