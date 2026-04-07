// Authentication check middleware for view protection
const User = require('../models/user.model');
const HTTP_STATUS = require('../constants/http-status');
const MESSAGES = require('../constants/messages');

const isApiRequest = (req) => (
    String(req.originalUrl || req.url || '').startsWith('/api/')
    || req.xhr
    || req.get('X-Requested-With') === 'XMLHttpRequest'
);

const sendUnauthorizedResponse = (res) => res.status(HTTP_STATUS.UNAUTHORIZED).json({
    error: MESSAGES.AUTH_REQUIRED
});

const ensureAuthenticated = async (req, res, next) => {
    // Strict Session Check
    if (req.session && req.session.userId) {
        return next();
    }

    // No Session -> Redirect to Login
    console.log('[Auth Check Fail] Session:', req.sessionID, 'UserId:', req.session ? req.session.userId : 'No Session');
    if (isApiRequest(req)) {
        return sendUnauthorizedResponse(res);
    }

    return res.redirect('/login');
};

const ensureOtpVerified = (req, res, next) => {
    // If user has a valid session, they are verified by definition of the login flow.
    // Double check session existence just in case.
    if (!req.session || !req.session.userId) {
        return res.redirect('/login');
    }
    next();
};

const ensureGuest = (req, res, next) => {
    // Prevent logged-in users from accessing login/signup
    if (req.session && req.session.userId) {
        if (req.session.role === 'admin') {
            return res.redirect('/admin/dashboard');
        }
        return res.redirect('/home');
    }
    next();
};

module.exports = { ensureAuthenticated, ensureOtpVerified, ensureGuest };
