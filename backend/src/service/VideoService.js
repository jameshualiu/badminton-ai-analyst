const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { PutObjectCommand, GetObjectCommand, DeleteObjectsCommand, ListObjectsV2Command } = require("@aws-sdk/client-s3");
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

    const { status, input, analysisJson } = videoData;
    const urls = {};

    // 2. Helper function to generate a read-only URL
    const generateGetUrl = async (key) => {
      if (!key) return null;
      const command = new GetObjectCommand({
        Bucket: process.env.E2_BUCKET_NAME,
        Key: key,
      });
      return await getSignedUrl(e2Client, command, { expiresIn: 3600 });
    };

    // 3. Generate URL for original video
    if (input && input.e2Key) {
      urls.originalVideo = await generateGetUrl(input.e2Key);
    }

    // 4. Generate URL for analysis telemetry
    if (analysisJson) {
      urls.analysisJson = await generateGetUrl(analysisJson);
    }

    return { status, urls };
  }

  async deleteVideo(userId, videoId) {
    const videoData = await this.repo.getVideo(userId, videoId);
    if (!videoData) {
      throw new Error("Video not found");
    }

    // 1. Cleanup E2 Artifacts
    // We want to delete everything under uploads/{userId}/{videoId}/ 
    // and outputs/{userId}/{videoId}/
    const prefixes = [
      `uploads/${userId}/${videoId}/`,
      `outputs/${userId}/${videoId}/`
    ];

    for (const prefix of prefixes) {
      try {
        const listCommand = new ListObjectsV2Command({
          Bucket: process.env.E2_BUCKET_NAME,
          Prefix: prefix,
        });
        const listResponse = await e2Client.send(listCommand);

        if (listResponse.Contents && listResponse.Contents.length > 0) {
          const deleteCommand = new DeleteObjectsCommand({
            Bucket: process.env.E2_BUCKET_NAME,
            Delete: {
              Objects: listResponse.Contents.map(obj => ({ Key: obj.Key })),
            },
          });
          await e2Client.send(deleteCommand);
        }
      } catch (err) {
        console.error(`Failed to delete E2 objects for prefix ${prefix}:`, err);
        // We continue to delete the DB record even if S3 fails
      }
    }

    // 2. Delete Firestore record
    await this.repo.deleteVideo(userId, videoId);
  }

  async markFailed(userId, videoId, errorMessage) {
    await this.repo.markFailed(userId, videoId, errorMessage);
  }
}

module.exports = VideoService;