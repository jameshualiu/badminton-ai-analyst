const { admin } = require('../config/firebase');
const AppError = require('../utils/AppError');

const verifyToken = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return next(new AppError('Unauthorized: No token provided', 401));
  }

  try {
    const decodedValue = await admin.auth().verifyIdToken(token);
    req.user = decodedValue;
    next();
  } catch (e) {
    console.error('Token verification failed', e);
    return next(new AppError('Invalid or expired token', 403));
  }
};

module.exports = verifyToken;
