const jwt = require('jsonwebtoken');
const User = require('../models/user.model');

const ensureAuthenticated = async (req, res, next) => {
    // 1. Check Passport Session (Google Auth)
    if (req.isAuthenticated && req.isAuthenticated()) {
        return next();
    }

    // 2. Check "token" Cookie (Local Auth)
    let token;
    if (req.cookies.token) {
        token = req.cookies.token;
    } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');

            // Check if user still exists (Optional but safer)
            const user = await User.findById(decoded.id).select('-password');
            if (user) {
                if (user.isBlocked) {
                    res.clearCookie('token');
                    return res.redirect('/login?error=blocked');
                }
                req.user = user; // Attach user to request
                return next();
            }
        } catch (error) {
            console.error('Session Token Invalid:', error.message);
            // Token invalid - clear it
            res.clearCookie('token');
        }
    }

    // 3. Fallback: No valid session
    res.redirect('/login');
};

const ensureOtpVerified = (req, res, next) => {
    // Assumption: req.user is already populated by ensureAuthenticated or Passport
    if (!req.user) {
        return res.redirect('/login');
    }

    // Check verified status
    // Note: Google Auth users are auto-verified in passport config
    if (req.user.isVerified) {
        return next();
    }

    // If not verified, redirect to OTP or Login
    // Check if we have an email to send them to OTP page context?
    // User model usually stores otp flags.
    res.redirect('/verify-otp');
};

module.exports = { ensureAuthenticated, ensureOtpVerified };
