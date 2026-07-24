const express = require("express");
const { db } = require("../config/firebase");

const VideoRepository = require("../repository/VideoRepository");
const VideoService = require("../service/VideoService");
const VideoController = require("../controller/VideoController");

const authMiddleware = require("../middleware/authMiddleware");
const { uploadLimiter } = require("../middleware/rateLimiter");

// dependency injection
const videoRepo = new VideoRepository(db);
const videoService = new VideoService(videoRepo);
const videoController = new VideoController(videoService);

const router = express.Router();

router.get("/:videoId/results", authMiddleware, videoController.getResults);
router.delete("/:videoId", authMiddleware, videoController.deleteVideo);

// Specific stricter limit for video uploads (Expensive operations)
router.post("/init", authMiddleware, uploadLimiter, videoController.initUpload);
router.post("/:videoId/complete", authMiddleware, uploadLimiter, videoController.finalizeUpload);

module.exports = router;
