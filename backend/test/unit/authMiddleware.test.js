const mockVerifyIdToken = jest.fn();

jest.mock('../../src/config/firebase', () => ({
  admin: { auth: () => ({ verifyIdToken: mockVerifyIdToken }) },
}));

const authMiddleware = require('../../src/middleware/authMiddleware');
const AppError = require('../../src/utils/AppError');

describe('authMiddleware', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    mockVerifyIdToken.mockReset();
    req = { headers: {} };
    res = {};
    next = jest.fn();
  });

  it('rejects with 401 when no Authorization header is present', async () => {
    await authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
    expect(mockVerifyIdToken).not.toHaveBeenCalled();
  });

  it('rejects with 403 when the token fails verification', async () => {
    req.headers.authorization = 'Bearer bad-token';
    mockVerifyIdToken.mockRejectedValue(new Error('invalid signature'));

    await authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(403);
  });

  it('sets req.user and calls next() with no error when the token is valid', async () => {
    req.headers.authorization = 'Bearer good-token';
    mockVerifyIdToken.mockResolvedValue({ uid: 'user-1', email: 'user@example.com' });

    await authMiddleware(req, res, next);

    expect(mockVerifyIdToken).toHaveBeenCalledWith('good-token');
    expect(req.user).toEqual({ uid: 'user-1', email: 'user@example.com' });
    expect(next).toHaveBeenCalledWith();
  });
});
