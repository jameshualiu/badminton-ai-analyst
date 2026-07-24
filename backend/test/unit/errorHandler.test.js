jest.mock('../../src/utils/logger', () => ({
  error: jest.fn(),
  info: jest.fn(),
}));

const logger = require('../../src/utils/logger');
const errorHandler = require('../../src/middleware/errorHandler');
const AppError = require('../../src/utils/AppError');

function buildRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('errorHandler', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    jest.clearAllMocks();
  });

  describe('in development', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });

    it('sends the full error, message, and stack', () => {
      const err = new AppError('Video not found', 404);
      const res = buildRes();

      errorHandler(err, {}, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(404);
      const body = res.json.mock.calls[0][0];
      expect(body.status).toBe('fail');
      expect(body.message).toBe('Video not found');
      expect(body.stack).toBeDefined();
    });
  });

  describe('in production', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('sends the sanitized message for an operational AppError', () => {
      const err = new AppError('Video not found', 404);
      const res = buildRes();

      errorHandler(err, {}, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ status: 'fail', message: 'Video not found' });
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('hides details and logs a generic 500 for a non-operational error', () => {
      const err = new Error('some internal crash');
      const res = buildRes();

      errorHandler(err, {}, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ status: 'error', message: 'Something went wrong!' });
      expect(logger.error).toHaveBeenCalledWith({ err }, 'Unhandled error');
    });

    it('defaults missing statusCode/status to 500/error', () => {
      const err = new Error('no status set');
      const res = buildRes();

      errorHandler(err, {}, res, jest.fn());

      expect(err.statusCode).toBe(500);
      expect(err.status).toBe('error');
    });
  });
});
