const VideoRepository = require('../../src/repository/VideoRepository');

function buildFakeDb() {
  const videoRef = {
    set: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    get: jest.fn(),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const videosDoc = jest.fn(() => videoRef);
  const videosCollection = jest.fn(() => ({ doc: videosDoc }));
  const userDoc = jest.fn(() => ({ collection: videosCollection }));
  const usersCollection = jest.fn(() => ({ doc: userDoc }));
  const db = { collection: usersCollection };

  return { db, videoRef, usersCollection, userDoc, videosCollection, videosDoc };
}

describe('VideoRepository', () => {
  let fake;
  let repo;

  beforeEach(() => {
    fake = buildFakeDb();
    repo = new VideoRepository(fake.db);
  });

  it('createVideoDoc writes the initial state under users/{userId}/videos/{videoId}', async () => {
    await repo.createVideoDoc('user-1', 'video-1', {
      title: 'match',
      input: { e2Key: 'uploads/user-1/video-1/match.mp4' },
    });

    expect(fake.usersCollection).toHaveBeenCalledWith('users');
    expect(fake.userDoc).toHaveBeenCalledWith('user-1');
    expect(fake.videosCollection).toHaveBeenCalledWith('videos');
    expect(fake.videosDoc).toHaveBeenCalledWith('video-1');

    const written = fake.videoRef.set.mock.calls[0][0];
    expect(written.title).toBe('match');
    expect(written.ownerId).toBe('user-1');
    expect(written.status).toBe('uploading');
    expect(written.progress).toEqual({ stage: 'UPLOADING', pct: 0 });
  });

  it('updateStatus sets status, timestamp, and uppercased progress stage', async () => {
    await repo.updateStatus('user-1', 'video-1', 'queued');

    expect(fake.videoRef.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'queued', 'progress.stage': 'QUEUED' })
    );
  });

  it('getVideo returns null when the document does not exist', async () => {
    fake.videoRef.get.mockResolvedValue({ exists: false });

    const result = await repo.getVideo('user-1', 'missing');

    expect(result).toBeNull();
  });

  it('getVideo returns the document data when it exists', async () => {
    fake.videoRef.get.mockResolvedValue({ exists: true, data: () => ({ status: 'done' }) });

    const result = await repo.getVideo('user-1', 'video-1');

    expect(result).toEqual({ status: 'done' });
  });

  it('deleteVideo deletes the document', async () => {
    await repo.deleteVideo('user-1', 'video-1');

    expect(fake.videoRef.delete).toHaveBeenCalled();
  });

  it('markFailed sets status to failed with the error message', async () => {
    await repo.markFailed('user-1', 'video-1', 'worker crashed');

    expect(fake.videoRef.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', error: 'worker crashed' })
    );
  });
});
