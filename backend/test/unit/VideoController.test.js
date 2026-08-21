const express = require('express');
const request = require('supertest');

jest.mock('@vercel/functions', () => ({ waitUntil: jest.fn() }));
const { waitUntil } = require('@vercel/functions');

const VideoController = require('../../src/controller/VideoController');
const errorHandler = require('../../src/middleware/errorHandler');
const AppError = require('../../src/utils/AppError');

function buildApp(service) {
  const controller = new VideoController(service);
  const app = express();
  app.use(express.json());

  // Stands in for authMiddleware, which is tested separately.
  app.use((req, _res, next) => {
    req.user = { uid: 'user-1' };
    next();
  });

  app.post('/init', controller.initUpload);
  app.post('/:videoId/complete', controller.finalizeUpload);
  app.get('/:videoId/results', controller.getResults);
  app.delete('/:videoId', controller.deleteVideo);

  app.use(errorHandler);
  return app;
}

describe('VideoController', () => {
  let service;
  let app;
  const originalFetch = global.fetch;
  const originalWebhookUrl = process.env.MODAL_WEBHOOK_URL;
  const originalWebhookSecret = process.env.MODAL_WEBHOOK_SECRET;
  const originalVercel = process.env.VERCEL;

  beforeEach(() => {
    service = {
      initializeUpload: jest.fn(),
      completeUpload: jest.fn(),
      getResultsUrls: jest.fn(),
      deleteVideo: jest.fn(),
      markFailed: jest.fn(),
      repo: { getVideo: jest.fn() },
    };
    app = buildApp(service);
    process.env.MODAL_WEBHOOK_URL = 'https://modal.example/webhook';
    process.env.MODAL_WEBHOOK_SECRET = 'test-secret';
    delete process.env.VERCEL;
    waitUntil.mockClear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.MODAL_WEBHOOK_URL = originalWebhookUrl;
    process.env.MODAL_WEBHOOK_SECRET = originalWebhookSecret;
    if (originalVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = originalVercel;
  });

  describe('POST /init', () => {
    it('400s when required fields are missing', async () => {
      const res = await request(app).post('/init').send({ filename: 'a.mp4' });

      expect(res.status).toBe(400);
      expect(service.initializeUpload).not.toHaveBeenCalled();
    });

    it('returns the service result on success', async () => {
      service.initializeUpload.mockResolvedValue({
        videoId: 'video-1',
        uploadUrl: 'https://r2.example/put',
        e2Key: 'uploads/user-1/video-1/a.mp4',
      });

      const res = await request(app)
        .post('/init')
        .send({ filename: 'a.mp4', contentType: 'video/mp4', size: 10 });

      expect(res.status).toBe(200);
      expect(res.body.videoId).toBe('video-1');
      expect(service.initializeUpload).toHaveBeenCalledWith('user-1', {
        filename: 'a.mp4',
        contentType: 'video/mp4',
        size: 10,
      });
    });
  });

  describe('POST /:videoId/complete', () => {
    it('marks the upload complete and responds immediately without waiting on the webhook', async () => {
      service.completeUpload.mockResolvedValue({ success: true });
      service.repo.getVideo.mockResolvedValue({ input: { e2Key: 'uploads/user-1/video-1/a.mp4' } });
      let resolveFetch;
      global.fetch = jest.fn(() => new Promise((resolve) => { resolveFetch = resolve; }));

      const res = await request(app).post('/video-1/complete').send();

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'queued' });
      expect(service.completeUpload).toHaveBeenCalledWith('user-1', 'video-1');
      // webhook fetch was fired but the response didn't wait on it
      expect(global.fetch).toHaveBeenCalledWith(
        'https://modal.example/webhook',
        expect.objectContaining({ method: 'POST' })
      );
      resolveFetch({ ok: true });
    });

    it('sends the shared-secret bearer token on the webhook request', async () => {
      service.completeUpload.mockResolvedValue({ success: true });
      service.repo.getVideo.mockResolvedValue({ input: { e2Key: 'uploads/user-1/video-1/a.mp4' } });
      global.fetch = jest.fn().mockResolvedValue({ ok: true });

      await request(app).post('/video-1/complete').send();
      await new Promise((resolve) => setImmediate(resolve));

      expect(global.fetch).toHaveBeenCalledWith(
        'https://modal.example/webhook',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer test-secret' })
        })
      );
    });

    it('marks the video failed when the webhook responds non-OK', async () => {
      service.completeUpload.mockResolvedValue({ success: true });
      service.repo.getVideo.mockResolvedValue({ input: { e2Key: 'uploads/user-1/video-1/a.mp4' } });
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve('boom') });

      await request(app).post('/video-1/complete').send();
      await new Promise((resolve) => setImmediate(resolve));

      expect(service.markFailed).toHaveBeenCalledWith(
        'user-1',
        'video-1',
        expect.stringContaining('500')
      );
    });

    it('marks the video failed when the webhook request itself throws', async () => {
      service.completeUpload.mockResolvedValue({ success: true });
      service.repo.getVideo.mockResolvedValue({ input: { e2Key: 'uploads/user-1/video-1/a.mp4' } });
      global.fetch = jest.fn().mockRejectedValue(new Error('network down'));

      await request(app).post('/video-1/complete').send();
      await new Promise((resolve) => setImmediate(resolve));

      expect(service.markFailed).toHaveBeenCalledWith(
        'user-1',
        'video-1',
        expect.stringContaining('network down')
      );
    });

    it('marks the video failed instead of leaving it stuck queued when it has no e2Key on record', async () => {
      service.completeUpload.mockResolvedValue({ success: true });
      service.repo.getVideo.mockResolvedValue({ input: null });
      global.fetch = jest.fn();

      const res = await request(app).post('/video-1/complete').send();

      expect(res.status).toBe(200);
      expect(global.fetch).not.toHaveBeenCalled();
      expect(service.markFailed).toHaveBeenCalledWith(
        'user-1',
        'video-1',
        expect.stringContaining('e2Key')
      );
    });

    it('marks the video failed instead of leaving it stuck queued when the video record itself is missing', async () => {
      service.completeUpload.mockResolvedValue({ success: true });
      service.repo.getVideo.mockResolvedValue(null);
      global.fetch = jest.fn();

      await request(app).post('/video-1/complete').send();

      expect(global.fetch).not.toHaveBeenCalled();
      expect(service.markFailed).toHaveBeenCalledWith(
        'user-1',
        'video-1',
        expect.stringContaining('e2Key')
      );
    });

    it('marks the video failed instead of leaving it stuck queued when repo.getVideo rejects', async () => {
      service.completeUpload.mockResolvedValue({ success: true });
      service.repo.getVideo.mockRejectedValue(new Error('firestore unavailable'));
      global.fetch = jest.fn();

      const res = await request(app).post('/video-1/complete').send();

      expect(res.status).toBe(200);
      expect(global.fetch).not.toHaveBeenCalled();
      expect(service.markFailed).toHaveBeenCalledWith(
        'user-1',
        'video-1',
        expect.stringContaining('firestore unavailable')
      );
    });

    it('sends an AbortSignal on the webhook fetch so a hung connection cannot wait forever', async () => {
      service.completeUpload.mockResolvedValue({ success: true });
      service.repo.getVideo.mockResolvedValue({ input: { e2Key: 'uploads/user-1/video-1/a.mp4' } });
      global.fetch = jest.fn().mockResolvedValue({ ok: true });

      await request(app).post('/video-1/complete').send();
      await new Promise((resolve) => setImmediate(resolve));

      expect(global.fetch).toHaveBeenCalledWith(
        'https://modal.example/webhook',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });

    it('marks the video failed with a timeout-specific message when the webhook request aborts', async () => {
      service.completeUpload.mockResolvedValue({ success: true });
      service.repo.getVideo.mockResolvedValue({ input: { e2Key: 'uploads/user-1/video-1/a.mp4' } });
      const abortError = new Error('The operation was aborted');
      abortError.name = 'TimeoutError';
      global.fetch = jest.fn().mockRejectedValue(abortError);

      await request(app).post('/video-1/complete').send();
      await new Promise((resolve) => setImmediate(resolve));

      expect(service.markFailed).toHaveBeenCalledWith(
        'user-1',
        'video-1',
        expect.stringContaining('timed out')
      );
    });

    it('hands the webhook promise to waitUntil when running on Vercel', async () => {
      process.env.VERCEL = '1';
      service.completeUpload.mockResolvedValue({ success: true });
      service.repo.getVideo.mockResolvedValue({ input: { e2Key: 'uploads/user-1/video-1/a.mp4' } });
      global.fetch = jest.fn().mockResolvedValue({ ok: true });

      const res = await request(app).post('/video-1/complete').send();

      expect(res.status).toBe(200);
      expect(waitUntil).toHaveBeenCalledTimes(1);
      expect(waitUntil).toHaveBeenCalledWith(expect.any(Promise));
    });

    it('does not call waitUntil when not on Vercel (persistent process)', async () => {
      service.completeUpload.mockResolvedValue({ success: true });
      service.repo.getVideo.mockResolvedValue({ input: { e2Key: 'uploads/user-1/video-1/a.mp4' } });
      global.fetch = jest.fn().mockResolvedValue({ ok: true });

      await request(app).post('/video-1/complete').send();

      expect(waitUntil).not.toHaveBeenCalled();
    });
  });

  describe('GET /:videoId/results', () => {
    it('404s when the service returns no result', async () => {
      service.getResultsUrls.mockResolvedValue(null);

      const res = await request(app).get('/video-1/results');

      expect(res.status).toBe(404);
    });

    it('returns the result on success', async () => {
      service.getResultsUrls.mockResolvedValue({ status: 'done', urls: { originalVideo: 'https://r2.example/x' } });

      const res = await request(app).get('/video-1/results');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('done');
    });

    it('propagates a thrown AppError from the service as the matching status code', async () => {
      service.getResultsUrls.mockRejectedValue(new AppError('Video not found', 404));

      const res = await request(app).get('/video-1/results');

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Video not found');
    });
  });

  describe('DELETE /:videoId', () => {
    it('returns success after deleting', async () => {
      service.deleteVideo.mockResolvedValue(undefined);

      const res = await request(app).delete('/video-1');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(service.deleteVideo).toHaveBeenCalledWith('user-1', 'video-1');
    });
  });
});
