const redirectAdminHome = (req, res, next) => {
    if (req.session.role === 'admin') {
        return res.redirect('/admin/dashboard');
    }
    next();
};

module.exports = redirectAdminHome;
