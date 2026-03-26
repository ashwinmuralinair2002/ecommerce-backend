// Authentication routes configuration

const express = require('express');
const {
    signup,
    login,
    verifyOtp,
    resendOtp,
    forgotPassword,
    resetPassword,
    handleGoogleAuthCallback
} = require('../controllers/auth.controller');
// const { verifyToken } = require('../middleware/auth.middleware'); // Removed
const { validate } = require('../middleware/validate.middleware');
const {
  signupSchema,
  loginSchema,
  verifyOtpSchema,
  resendOtpSchema,
  forgotPasswordSchema,
  resetPasswordSchema
} = require('../validations/auth.validation');

const router = express.Router();



router.post('/signup', validate(signupSchema), signup);

router.post('/login', validate(loginSchema), login);
router.post('/verify-otp', validate(verifyOtpSchema), verifyOtp);
router.post('/resend-otp', validate(resendOtpSchema), resendOtp);
router.post('/forgot-password', validate(forgotPasswordSchema), forgotPassword);
router.post('/reset-password', validate(resetPasswordSchema), resetPassword);
router.post('/logout', require('../controllers/auth.controller').logout);

// Google Auth Routes
const passport = require('passport');

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get(
    '/google/callback',
    handleGoogleAuthCallback
);

// Example protected route (Cleaned up)
// router.get('/protected', verifyToken, (req, res) => { ... }); // Removed

module.exports = router;
