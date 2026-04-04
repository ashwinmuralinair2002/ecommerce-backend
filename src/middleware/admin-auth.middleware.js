// Admin authentication middleware ensuring admin role access
const { requireAdmin } = require('./role-auth.middleware');

const ensureAdminAuthenticated = (req, res, next) => {
    console.log('Admin session:', req.session?.admin);
    return requireAdmin(req, res, next);
};

module.exports = { ensureAdminAuthenticated };
