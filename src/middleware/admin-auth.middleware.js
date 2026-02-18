// Admin authentication middleware ensuring admin session
const User = require('../models/user.model');

const ensureAdminAuthenticated = async (req, res, next) => {
    // Strict Admin Session Check
    if (req.session && req.session.userId && req.session.role === 'admin') {
        return next();
    }

    // Auth Failed
    res.redirect('/login');
};

module.exports = { ensureAdminAuthenticated };
