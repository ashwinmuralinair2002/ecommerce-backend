const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  message: 'Too many attempts. Please try again after a minute.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

const paymentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  message: 'Too many payment attempts. Please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
});

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 50,
  message: 'Too many actions. Please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  authLimiter,
  paymentLimiter,
  generalLimiter,
};
