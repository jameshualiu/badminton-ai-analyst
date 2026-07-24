jest.mock('../../src/config/r2', () => ({ send: jest.fn() }));
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));
jest.mock('uuid', () => ({ v4: () => 'test-video-id' }));

const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const r2Client = require('../../src/config/r2');
const VideoService = require('../../src/service/VideoService');
const AppError = require('../../src/utils/AppError');

describe('VideoService', () => {
  let repo;
  let service;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = {
      createVideoDoc: jest.fn().mockResolvedValue(undefined),
      updateStatus: jest.fn().mockResolvedValue(undefined),
      getVideo: jest.fn(),
      deleteVideo: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
    };
    service = new VideoService(repo);
    process.env.R2_BUCKET_NAME = 'test-bucket';
  });

  describe('initializeUpload', () => {
    it('creates the DB doc under a namespaced e2Key and returns a presigned upload URL', async () => {
      getSignedUrl.mockResolvedValue('https://r2.example/put-url');

      const result = await service.initializeUpload('user-1', {
        filename: 'match.mp4',
        contentType: 'video/mp4',
        size: 12345,
      });

      expect(repo.createVideoDoc).toHaveBeenCalledTimes(1);
      const [userId, videoId, data] = repo.createVideoDoc.mock.calls[0];
      expect(userId).toBe('user-1');
      expect(data.title).toBe('match');
      expect(data.input.e2Key).toBe(`uploads/user-1/${videoId}/match.mp4`);
      expect(data.input.contentType).toBe('video/mp4');
      expect(data.input.sizeBytes).toBe(12345);

      expect(result.videoId).toBe(videoId);
      expect(result.uploadUrl).toBe('https://r2.example/put-url');
      expect(result.e2Key).toBe(data.input.e2Key);
    });
  });

  describe('completeUpload', () => {
    it('marks the video as queued', async () => {
      const result = await service.completeUpload('user-1', 'video-1');

      expect(repo.updateStatus).toHaveBeenCalledWith('user-1', 'video-1', 'queued');
      expect(result).toEqual({ success: true, videoId: 'video-1' });
    });
  });

  describe('getResultsUrls', () => {
    it('throws a 404 AppError when the video does not exist', async () => {
      repo.getVideo.mockResolvedValue(null);

      await expect(service.getResultsUrls('user-1', 'missing')).rejects.toMatchObject({
        message: 'Video not found',
        statusCode: 404,
      });
      await expect(service.getResultsUrls('user-1', 'missing')).rejects.toBeInstanceOf(AppError);
    });

    it('returns presigned URLs for whatever artifacts are present', async () => {
      repo.getVideo.mockResolvedValue({
        status: 'done',
        input: { e2Key: 'uploads/user-1/video-1/match.mp4' },
        analysisJson: 'outputs/user-1/video-1/analysis.json',
      });
      getSignedUrl
        .mockResolvedValueOnce('https://r2.example/original')
        .mockResolvedValueOnce('https://r2.example/analysis');

      const result = await service.getResultsUrls('user-1', 'video-1');

      expect(result).toEqual({
        status: 'done',
        urls: {
          originalVideo: 'https://r2.example/original',
          analysisJson: 'https://r2.example/analysis',
        },
      });
    });

    it('omits a URL when the corresponding artifact key is missing', async () => {
      repo.getVideo.mockResolvedValue({
        status: 'running',
        input: { e2Key: 'uploads/user-1/video-1/match.mp4' },
        analysisJson: null,
      });
      getSignedUrl.mockResolvedValue('https://r2.example/original');

      const result = await service.getResultsUrls('user-1', 'video-1');

      expect(result.urls.originalVideo).toBe('https://r2.example/original');
      expect(result.urls.analysisJson).toBeUndefined();
    });
  });

  describe('deleteVideo', () => {
    it('throws a 404 AppError when the video does not exist', async () => {
      repo.getVideo.mockResolvedValue(null);

      await expect(service.deleteVideo('user-1', 'missing')).rejects.toMatchObject({
        message: 'Video not found',
        statusCode: 404,
      });
      expect(repo.deleteVideo).not.toHaveBeenCalled();
    });

    it('deletes R2 objects under both prefixes and the Firestore record', async () => {
      repo.getVideo.mockResolvedValue({ status: 'done' });
      r2Client.send
        .mockResolvedValueOnce({ Contents: [{ Key: 'uploads/user-1/video-1/match.mp4' }] })
        .mockResolvedValueOnce({}) // delete for uploads/ prefix
        .mockResolvedValueOnce({ Contents: [] }) // outputs/ prefix listing, nothing to delete
        ;

      await service.deleteVideo('user-1', 'video-1');

      expect(r2Client.send).toHaveBeenCalledTimes(3);
      expect(repo.deleteVideo).toHaveBeenCalledWith('user-1', 'video-1');
    });

    it('still deletes the Firestore record if R2 cleanup fails', async () => {
      repo.getVideo.mockResolvedValue({ status: 'done' });
      r2Client.send.mockRejectedValue(new Error('R2 unavailable'));

      await service.deleteVideo('user-1', 'video-1');

      expect(repo.deleteVideo).toHaveBeenCalledWith('user-1', 'video-1');
    });
  });

  describe('markFailed', () => {
    it('delegates to the repo', async () => {
      await service.markFailed('user-1', 'video-1', 'boom');

      expect(repo.markFailed).toHaveBeenCalledWith('user-1', 'video-1', 'boom');
    });
  });
});
