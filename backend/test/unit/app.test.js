// Verifies the extracted Express app (src/app.js) wires up end-to-end.
// Only Firebase is mocked; the real router/middleware/error-handler run.
// uuid v13 is ESM-only and breaks Jest's CJS parser, so it's mocked (same
// as VideoService.test.js) — it's pulled in transitively via the app chain.
jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));
jest.mock('../../src/config/firebase', () => ({
  db: {
    collection: jest.fn(() => ({
      limit: jest.fn(() => ({ get: jest.fn(async () => ({ size: 0 })) })),
    })),
  },
  admin: { auth: jest.fn(() => ({ verifyIdToken: jest.fn() })) },
}));

const request = require('supertest');
const app = require('../../src/app');

describe('app wiring', () => {
  it('serves GET /api/health/firestore', async () => {
    const res = await request(app).get('/api/health/firestore');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, size: 0 });
  });

  it('returns 404 via AppError/errorHandler for unknown routes', async () => {
    const res = await request(app).get('/api/does-not-exist');

    expect(res.status).toBe(404);
  });
});
