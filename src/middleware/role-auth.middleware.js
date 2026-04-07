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

const requireAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        if (isApiRequest(req)) {
            return sendUnauthorizedResponse(res);
        }

        return res.redirect(req.user && req.user.role === 'user' ? '/' : '/login');
    }

    return next();
};

const requireUser = (req, res, next) => {
    if (!req.user || req.user.role !== 'user') {
        if (isApiRequest(req)) {
            return sendUnauthorizedResponse(res);
        }

        return res.redirect(req.user && req.user.role === 'admin' ? '/admin/dashboard' : '/login');
    }

    return next();
};

module.exports = {
    requireAdmin,
    requireUser
};
