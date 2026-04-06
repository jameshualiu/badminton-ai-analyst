class VideoRepository {
  constructor(db) {
    this.db = db;
  }

  // Create the initial video document with all the placeholders
  async createVideoDoc(userId, videoId, data) {
    const videoRef = this.db.collection('users').doc(userId).collection('videos').doc(videoId);
    
    // Define the initial state (Same structure as your old frontend code)
    const initialState = {
      ...data, // title, input info
      ownerId: userId,
      createdAt: new Date(), // Firestore generic timestamp
      updatedAt: new Date(),
      status: 'uploading', 
      progress: { stage: 'UPLOADING', pct: 0 },
      artifacts: {
        track: null, events: null, poses: null, metrics: null,
        heatmapImage: null, heatmapPoints: null, summary: null,
        annotatedVideo: null, thumbnail: null,
      },
      summary: {
        durationSec: null, totalShots: null, shotCounts: {},
        trackingQuality: { ballVisiblePct: null },
      },
    };

    await videoRef.set(initialState);
    return videoId;
  }

  // Update status (e.g., to "queued")
  async updateStatus(userId, videoId, status) {
    const videoRef = this.db.collection('users').doc(userId).collection('videos').doc(videoId);
    
    await videoRef.update({
      status: status,
      updatedAt: new Date(),
      "progress.stage": status.toUpperCase()
    });
  }

  async getVideo(userId, videoId) {
    const docRef = this.db.collection('users').doc(userId).collection('videos').doc(videoId);
    const snapshot = await docRef.get();
    
    if (!snapshot.exists) {
      return null;
    }
    
    return snapshot.data();
  }

  async deleteVideo(userId, videoId) {
    const videoRef = this.db.collection('users').doc(userId).collection('videos').doc(videoId);
    await videoRef.delete();
  }

  async markFailed(userId, videoId, errorMessage) {
    const videoRef = this.db.collection('users').doc(userId).collection('videos').doc(videoId);
    await videoRef.update({ status: 'failed', error: errorMessage, updatedAt: new Date() });
  }
}

module.exports = VideoRepository;