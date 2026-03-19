const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { v4: uuidv4 } = require('uuid');
const e2Client = require('../config/e2'); // Your E2 client configuration

class VideoService {
  constructor(videoRepo) {
    this.repo = videoRepo;
  }

  // Step 1: Generate URL + Create DB Record
  async initializeUpload(userId, fileMeta) {
    const videoId = uuidv4();
    const e2Key = `uploads/${userId}/${videoId}/${fileMeta.filename}`;

    // A. Generate Presigned PUT URL (valid for 1 hour)
    const command = new PutObjectCommand({
      Bucket: process.env.E2_BUCKET_NAME,
      Key: e2Key,
      ContentType: fileMeta.contentType,
    });
    
    const uploadUrl = await getSignedUrl(e2Client, command, { expiresIn: 3600 });

    // B. Create the DB Document immediately
    await this.repo.createVideoDoc(userId, videoId, {
      title: fileMeta.filename.replace(/\.[^.]+$/, ""),
      input: {
        e2Key,
        contentType: fileMeta.contentType,
        sizeBytes: fileMeta.size,
        originalFilename: fileMeta.filename,
      }
    });

    return { videoId, uploadUrl, e2Key };
  }

  // Step 2: Mark upload as complete
  async completeUpload(userId, videoId) {
    // Mark as queued so the Python worker picks it up
    await this.repo.updateStatus(userId, videoId, 'queued');
    return { success: true, videoId };
  }

  async getResultsUrls(userId, videoId) {
    // 1. Fetch the video document from the database
    const videoData = await this.repo.getVideo(userId, videoId);
    
    if (!videoData) {
      throw new Error("Video not found");
    }

    const { status, artifacts, input } = videoData;
    const urls = {};

    // 2. Helper function to generate a read-only URL
    const generateGetUrl = async (key) => {
      if (!key) return null;
      const command = new GetObjectCommand({
        Bucket: process.env.E2_BUCKET_NAME,
        Key: key,
      });
      // URL expires in 1 hour
      return await getSignedUrl(e2Client, command, { expiresIn: 3600 });
    };

    // 3. Generate URLs for the original video (so the user can replay it)
    if (input && input.e2Key) {
      urls.originalVideo = await generateGetUrl(input.e2Key);
    }

    // 4. Generate URLs for any AI artifacts that exist
    if (artifacts) {
      // Loop through all possible artifacts (heatmap, annotatedVideo, summary, etc.)
      for (const [artifactName, artifactKey] of Object.entries(artifacts)) {
        if (artifactKey) {
          urls[artifactName] = await generateGetUrl(artifactKey);
        }
      }
    }

    return { status, urls };
  }
}

module.exports = VideoService;