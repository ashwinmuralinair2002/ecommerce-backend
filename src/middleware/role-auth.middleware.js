const requireAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.redirect(req.user && req.user.role === 'user' ? '/' : '/login');
    }

    return next();
};

const requireUser = (req, res, next) => {
    if (!req.user || req.user.role !== 'user') {
        return res.redirect(req.user && req.user.role === 'admin' ? '/admin/dashboard' : '/login');
    }

    return next();
};

module.exports = {
    requireAdmin,
    requireUser
};
