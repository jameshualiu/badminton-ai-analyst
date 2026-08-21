const { waitUntil } = require('@vercel/functions');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../utils/logger');

class VideoController {
  constructor(videoService) {
    this.service = videoService;
  }

  // POST /api/videos/init
  initUpload = asyncHandler(async (req, res, next) => {
    const { filename, contentType, size } = req.body;
    const userId = req.user.uid; // From authMiddleware

    if (!filename || !contentType || !size) {
      return next(new AppError('Missing required fields: filename, contentType, or size', 400));
    }

    const result = await this.service.initializeUpload(userId, { filename, contentType, size });
    res.json(result);
  });

  // POST /api/videos/:videoId/complete
  finalizeUpload = asyncHandler(async (req, res, next) => {
    const { videoId } = req.params;
    const userId = req.user.uid;

    if (!videoId) {
      return next(new AppError('Video ID is required', 400));
    }

    // 1. Mark as queued in DB
    await this.service.completeUpload(userId, videoId);

    // 2. Trigger Modal AI Worker (Asynchronously)
    // We get the video record first to get the E2 key
    try {
        const videoData = await this.service.repo.getVideo(userId, videoId);
        if (videoData && videoData.input && videoData.input.e2Key) {
            logger.info({ videoId }, "Triggering Modal AI");

            // Don't await, so the user gets an instant response.
            const triggerPromise = fetch(process.env.MODAL_WEBHOOK_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.MODAL_WEBHOOK_SECRET}`
                },
                body: JSON.stringify({
                    videoId: videoId,
                    userId: userId,
                    videoE2Key: videoData.input.e2Key
                }),
                // The Modal endpoint runs the full pipeline synchronously before
                // responding, so this can legitimately take up to its own 20-minute
                // (timeout=1200) limit for a long video. 21 minutes gives it that
                // full window plus buffer -- this signal is a backstop for a
                // connection-level hang (request never reaching Modal at all), not
                // a bound on normal processing time.
                signal: AbortSignal.timeout(21 * 60 * 1000)
            })
            .then(async (response) => {
                if (!response.ok) {
                    const errText = await response.text().catch(() => '');
                    logger.error({ videoId, status: response.status, errText }, "Modal webhook returned non-OK status");
                    await this.service.markFailed(userId, videoId, `Worker trigger failed (${response.status})`);
                }
            })
            .catch(async (err) => {
                logger.error({ videoId, err }, "Modal trigger request failed");
                const message = err.name === 'AbortError' || err.name === 'TimeoutError'
                    ? 'Worker trigger timed out'
                    : `Worker trigger error: ${err.message}`;
                await this.service.markFailed(userId, videoId, message);
            });

            // On Vercel serverless, the instance can be frozen the moment we send
            // the response, killing the in-flight webhook (and its error handling).
            // Hand the promise to the runtime so it stays alive until it settles.
            // Locally/Docker the persistent process makes this unnecessary.
            if (process.env.VERCEL) {
                waitUntil(triggerPromise);
            }
        } else {
            logger.error({ videoId }, "Video record missing input.e2Key; cannot trigger Modal AI");
            await this.service.markFailed(userId, videoId, 'Video record is missing its upload location (e2Key)');
        }
    } catch (err) {
        logger.error({ videoId, err }, "Failed to fetch video for Modal trigger");
        await this.service.markFailed(userId, videoId, `Failed to read video record: ${err.message}`);
    }

    res.json({ status: 'queued' });
  });

  // GET /api/videos/:videoId/results
  getResults = asyncHandler(async (req, res, next) => {
    const { videoId } = req.params;
    const userId = req.user.uid;

    if (!videoId) {
      return next(new AppError('Video ID is required', 400));
    }

    const result = await this.service.getResultsUrls(userId, videoId);
    
    if (!result) {
      return next(new AppError('Results not found for this video', 404));
    }

    res.json(result);
  });

  // DELETE /api/videos/:videoId
  deleteVideo = asyncHandler(async (req, res, next) => {
    const { videoId } = req.params;
    const userId = req.user.uid;

    if (!videoId) {
      return next(new AppError('Video ID is required', 400));
    }

    await this.service.deleteVideo(userId, videoId);
    res.json({ success: true });
  });
}

module.exports = VideoController;
