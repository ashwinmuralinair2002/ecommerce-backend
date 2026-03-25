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
const { signupValidation, forgotPasswordValidation } = require('../middleware/auth-validation.middleware');
// const { verifyToken } = require('../middleware/auth.middleware'); // Removed

const router = express.Router();



router.post(
    '/signup',
    signupValidation,
    signup
);

router.post('/login', login);
router.post('/verify-otp', verifyOtp);
router.post('/resend-otp', resendOtp);
router.post('/forgot-password', forgotPasswordValidation, forgotPassword);
router.post('/reset-password', resetPassword);
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
