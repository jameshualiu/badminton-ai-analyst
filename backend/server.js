// Local / Docker entry point. On Vercel the app is served as a serverless
// function via api/index.js instead (no long-lived listener).
const app = require("./src/app");

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
