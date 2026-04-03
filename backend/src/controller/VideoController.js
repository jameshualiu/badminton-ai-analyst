const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

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
            console.log(`🚀 Triggering Modal AI for video: ${videoId}`);
            
            // Fire and forget (don't await so the user gets an instant response)
            fetch(process.env.MODAL_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    videoId: videoId,
                    userId: userId,
                    videoE2Key: videoData.input.e2Key
                })
            }).catch(err => console.error('❌ Modal Trigger Error:', err));
        }
    } catch (err) {
        console.error('❌ Error fetching video for Modal trigger:', err);
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
