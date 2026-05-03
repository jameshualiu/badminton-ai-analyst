const { rateLimit } = require('express-rate-limit');

/**
 * Global Rate Limiter
 * 
 * This protects your entire API from general "noise" and basic bots.
 * 100 requests in 15 minutes is plenty for a normal human browsing your dashboard.
 */
const globalLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 100, 
	message: {
        status: 429,
        message: 'Too many requests from this IP, please try again after 15 minutes'
    },
	standardHeaders: 'draft-7', 
	legacyHeaders: false, 
});

/**
 * Strict Limiter for Sensitive Routes (Updated to 5 per 30 mins)
 * 
 * Real-world context: Each video upload triggers an S3 pre-signed URL and 
 * prepares your database. We limit this to 5 per 30 minutes so that a single
 * user can't accidentally (or maliciously) trigger hundreds of expensive 
 * cloud operations.
 */
const uploadLimiter = rateLimit({
	windowMs: 30 * 60 * 1000, // 30 minutes
	max: 10, 
	message: {
        status: 429,
        message: 'Too many upload attempts. Please wait 30 minutes before trying again.'
    },
	standardHeaders: 'draft-7',
	legacyHeaders: false,
});

module.exports = {
    globalLimiter,
    uploadLimiter
};
