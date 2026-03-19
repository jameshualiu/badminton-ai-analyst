const admin = require("firebase-admin");
const path = require("path");

if (!admin.apps.length) {
  const serviceAccountPath = path.join(__dirname, "serviceAccount.json");
  const serviceAccount = require(serviceAccountPath);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();
const authAdmin = admin.auth();

module.exports = { admin, db, authAdmin };