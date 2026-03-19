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

    await this.service.completeUpload(userId, videoId);
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
}

module.exports = VideoController;
