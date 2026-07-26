const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { db } = require("./config/firebase");

const errorHandler = require("./middleware/errorHandler");
const { globalLimiter } = require("./middleware/rateLimiter");
const videoRoutes = require("./routes/videoRoutes");
const AppError = require("./utils/AppError");

const app = express();

// Behind Vercel's (or any) proxy, trust the first hop so req.ip / the rate
// limiter see the real client IP from X-Forwarded-For instead of the proxy's.
app.set("trust proxy", 1);

app.use(cors());
app.use(express.json());

const apiRouter = express.Router();

// Apply global rate limiting to all API routes
apiRouter.use(globalLimiter);

// routing
apiRouter.get("/health/firestore", async (_req, res) => {
  const snap = await db.collection("_health").limit(1).get();
  res.json({ ok: true, size: snap.size });
});

apiRouter.use("/videos", videoRoutes);

app.use("/api", apiRouter);

// Handle undefined routes
app.use((req, _res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// Global Error Handler
app.use(errorHandler);

module.exports = app;
