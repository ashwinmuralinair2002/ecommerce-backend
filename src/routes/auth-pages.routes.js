const express = require('express');
const { ensureGuest } = require('../middleware/auth-check.middleware');

const router = express.Router();

router.get('/login', ensureGuest, (req, res) => {
    res.render('login');
});

router.get('/signup', ensureGuest, (req, res) => {
    res.render('auth/signup');
});

router.get('/verify-otp', (req, res) => {
    // Pass session email (primary) or query email (fallback)
    const email = req.session.otpEmail || req.query.email || '';
    res.render('auth/otp', { email });
});

router.get('/forgot-password', ensureGuest, (req, res) => {
    res.render('auth/forgot-password');
});

router.get('/reset-password', ensureGuest, (req, res) => {
    res.render('auth/reset-password');
});

router.get('/password-success', (req, res) => {
    res.render('auth/password-success');
});

module.exports = router;
