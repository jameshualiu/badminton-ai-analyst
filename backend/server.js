const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { db, admin } = require("./src/config/firebase");

const app = express();
app.use(cors());
app.use(express.json());

const errorHandler = require('./src/middleware/errorHandler');
const { globalLimiter } = require('./src/middleware/rateLimiter');
const videoRoutes = require('./src/routes/videoRoutes');

const apiRouter = express.Router();

// Apply global rate limiting to all API routes
apiRouter.use(globalLimiter);

//routing
apiRouter.get("/health/firestore", async (_req, res) => {
  const snap = await db.collection("_health").limit(1).get();
  res.json({ ok: true, size: snap.size });
});

apiRouter.use("/videos", videoRoutes);

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