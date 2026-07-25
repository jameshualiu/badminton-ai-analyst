// Vercel serverless entry point. @vercel/node serves the exported Express app
// as a single function; vercel.json rewrites every path here so Express's own
// /api router handles routing (the rewrite preserves the original req.url).
module.exports = require("../src/app");
