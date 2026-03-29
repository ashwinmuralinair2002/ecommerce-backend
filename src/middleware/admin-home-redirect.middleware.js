const redirectAdminHome = (req, res, next) => {
    if ((req.user && req.user.role === 'admin') || (req.session && req.session.role === 'admin')) {
        return res.redirect('/admin/dashboard');
    }
    next();
};

module.exports = redirectAdminHome;
