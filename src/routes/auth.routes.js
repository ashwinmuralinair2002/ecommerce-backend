// Authentication routes configuration

const express = require('express');
const { check } = require('express-validator');
const { signup, login, verifyOtp, resendOtp, forgotPassword, resetPassword } = require('../controllers/auth.controller');
// const { verifyToken } = require('../middleware/auth.middleware'); // Removed

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

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get(
    '/google/callback',
    passport.authenticate('google', { failureRedirect: '/login', session: false }),
    (req, res) => {
        // Successful authentication, data is in req.user (from passport strategy)

        req.session.regenerate((err) => {
            if (err) {
                console.error('Google Auth Session Error:', err);
                return res.redirect('/login');
            }

            // Standardize Session
            req.session.userId = req.user._id.toString();
            req.session.role = req.user.role || 'user';

            req.session.save((err) => {
                if (err) {
                    console.error('Google Auth Session Save Error:', err);
                    return res.redirect('/login');
                }
                res.redirect('/home');
            });
        });
    }
);

// Example protected route (Cleaned up)
// router.get('/protected', verifyToken, (req, res) => { ... }); // Removed

module.exports = router;
