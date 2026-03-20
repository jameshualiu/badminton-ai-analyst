const admin = require("firebase-admin");
const path = require("path");

if (!admin.apps.length) {
  let serviceAccount;

  // Use environment variables if available (Production/Render)
  if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL) {
    serviceAccount = {
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    };
  } else {
    // Fallback to serviceAccount.json file (Local Development)
    try {
      const serviceAccountPath = path.join(__dirname, "serviceAccount.json");
      serviceAccount = require(serviceAccountPath);
    } catch (error) {
      console.error("Firebase admin initialization failed: Missing environment variables or serviceAccount.json");
      throw error;
    }
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();
const authAdmin = admin.auth();

module.exports = { admin, db, authAdmin };