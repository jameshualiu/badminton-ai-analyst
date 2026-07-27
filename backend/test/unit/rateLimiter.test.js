const { RedisStore } = require('rate-limit-redis');
const { createRedisClient } = require('../../src/config/redis');
const { buildStore, sendCommandFor, FailOpenStore } = require('../../src/middleware/rateLimiter');

describe('createRedisClient', () => {
  test('returns null when REDIS_URL is not configured (fall back to in-memory)', () => {
    expect(createRedisClient({})).toBeNull();
  });

  test('returns a Redis client when REDIS_URL is configured', () => {
    // lazyConnect means no socket is opened by the constructor, so this is
    // safe to run offline; disconnect() cleans up the (unopened) client.
    const client = createRedisClient({ REDIS_URL: 'redis://localhost:6379' });
    expect(client).not.toBeNull();
    expect(typeof client.call).toBe('function');
    client.disconnect();
  });
});

describe('buildStore', () => {
  test('falls back to the in-memory store (undefined) when no client is provided', () => {
    expect(buildStore(null, 'rl:global:')).toBeUndefined();
  });

  test('returns a Redis-backed, fail-open store with the given prefix when a client is provided', () => {
    const fakeClient = { call: jest.fn() };
    const store = buildStore(fakeClient, 'rl:upload:');
    expect(store).toBeInstanceOf(FailOpenStore);
    expect(store.inner).toBeInstanceOf(RedisStore);
    expect(store.inner.prefix).toBe('rl:upload:');
  });

});

describe('sendCommandFor', () => {
  test('forwards variadic command tokens to the client via ioredis .call()', () => {
    const fakeClient = { call: jest.fn().mockReturnValue('OK') };
    const sendCommand = sendCommandFor(fakeClient);
    const result = sendCommand('EVALSHA', 'sha', '1', 'key');
    expect(fakeClient.call).toHaveBeenCalledWith('EVALSHA', 'sha', '1', 'key');
    expect(result).toBe('OK');
  });
});

describe('FailOpenStore', () => {
  test('delegates increment to the inner store when it succeeds', async () => {
    const inner = {
      increment: jest.fn().mockResolvedValue({ totalHits: 3, resetTime: undefined }),
    };
    const store = new FailOpenStore(inner);
    await expect(store.increment('k')).resolves.toEqual({ totalHits: 3, resetTime: undefined });
    expect(inner.increment).toHaveBeenCalledWith('k');
  });

  test('fails open (allows the request) when the inner store throws', async () => {
    const inner = {
      increment: jest.fn().mockRejectedValue(new Error('redis unreachable')),
    };
    const store = new FailOpenStore(inner);
    const result = await store.increment('k');
    // 0 hits => under any configured max => request is allowed through
    expect(result.totalHits).toBe(0);
  });

  test('swallows errors from decrement and resetKey so a Redis blip is non-fatal', async () => {
    const inner = {
      decrement: jest.fn().mockRejectedValue(new Error('redis unreachable')),
      resetKey: jest.fn().mockRejectedValue(new Error('redis unreachable')),
    };
    const store = new FailOpenStore(inner);
    await expect(store.decrement('k')).resolves.toBeUndefined();
    await expect(store.resetKey('k')).resolves.toBeUndefined();
  });

  test('forwards init(options) to the inner store', () => {
    const inner = { init: jest.fn() };
    const store = new FailOpenStore(inner);
    const options = { windowMs: 1000 };
    store.init(options);
    expect(inner.init).toHaveBeenCalledWith(options);
  });
});
