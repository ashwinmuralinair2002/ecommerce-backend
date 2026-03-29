// Admin authentication middleware ensuring admin role access
const { requireAdmin } = require('./role-auth.middleware');

const ensureAdminAuthenticated = (req, res, next) => requireAdmin(req, res, next);

module.exports = { ensureAdminAuthenticated };
