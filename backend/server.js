const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { db, admin } = require("./src/config/firebase");

const app = express();
app.use(cors());
app.use(express.json());

const VideoRepository = require('./src/repository/VideoRepository');
const VideoService = require('./src/service/VideoService');
const VideoController = require('./src/controller/VideoController');

const authMiddleware = require('./src/middleware/authMiddleware');
const errorHandler = require('./src/middleware/errorHandler');
const { globalLimiter, uploadLimiter } = require('./src/middleware/rateLimiter');

//dependency injection
const videoRepo = new VideoRepository(db);
const videoService = new VideoService(videoRepo);
const videoController = new VideoController(videoService);

const apiRouter = express.Router();

// Apply global rate limiting to all API routes
apiRouter.use(globalLimiter);

//routing
apiRouter.get("/health/firestore", async (_req, res) => {
  const snap = await db.collection("_health").limit(1).get();
  res.json({ ok: true, size: snap.size });
});

apiRouter.get( "/videos/:videoId/results",  authMiddleware,  videoController.getResults);
apiRouter.delete("/videos/:videoId", authMiddleware, videoController.deleteVideo);

// Specific stricter limit for video uploads (Expensive operations)
apiRouter.post("/videos/init", authMiddleware, uploadLimiter, videoController.initUpload);
apiRouter.post("/videos/:videoId/complete", authMiddleware, uploadLimiter, videoController.finalizeUpload);

app.use("/api", apiRouter);

// Handle undefined routes
app.use((req, res, next) => {
  const AppError = require('./src/utils/AppError');
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// Global Error Handler
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));