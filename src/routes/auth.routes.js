// Authentication routes configuration
const express = require('express');
const { check } = require('express-validator');
const { signup, login, verifyOtp, resendOtp, forgotPassword, resetPassword } = require('../controllers/auth.controller');
const { verifyToken } = require('../middleware/auth.middleware');

const router = express.Router();

router.post(
    '/signup',
    [
        check('name', 'Name is required').not().isEmpty(),
        check('email', 'Please include a valid email').isEmail(),
        check('password', 'Password must be at least 6 characters').isLength({ min: 6 }),
    ],
    signup
);

router.post('/login', login);
router.post('/verify-otp', verifyOtp);
router.post('/resend-otp', resendOtp);
router.post('/forgot-password', [
    check('email', 'Please include a valid email').isEmail()
], forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/logout', require('../controllers/auth.controller').logout);

// Google Auth Routes
const passport = require('passport');
const jwt = require('jsonwebtoken');

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get(
    '/google/callback',
    passport.authenticate('google', { failureRedirect: '/login', session: false }),
    (req, res) => {
        // Generate JWT
        const token = jwt.sign(
            { id: req.user._id, role: req.user.role },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        // Redirect with token
        // In a clearer implementation, we might send an HTML page that saves token to localstorage
        // For now, redirect to login with query param, frontend will check it
        res.redirect(`/login?token=${token}&user=${encodeURIComponent(JSON.stringify(req.user))}`);
    }
);

// Example protected route
router.get('/protected', verifyToken, (req, res) => {
    res.json({ message: 'This is a protected route', user: req.user });
});

module.exports = router;
