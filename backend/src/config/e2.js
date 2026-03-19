require('dotenv').config();
const { S3Client } = require('@aws-sdk/client-s3');

const e2Client = new S3Client({
  region: process.env.E2_REGION, // e.g., 'us-east-1' or 'us-chi-1'
  endpoint: process.env.E2_ENDPOINT, // e.g., 'https://u0e1.c15.e2-2.dev'
  credentials: {
    accessKeyId: process.env.E2_ACCESS_KEY,
    secretAccessKey: process.env.E2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true, // <--- IMPORTANT for IDrive e2
});

module.exports = e2Client;