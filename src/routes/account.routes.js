const express = require('express');
const { ensureAuthenticated } = require('../middleware/auth-check.middleware');
const { requireUser } = require('../middleware/role-auth.middleware');

const router = express.Router();

router.get('/', ensureAuthenticated, requireUser, (req, res) => {
    res.render('user-account', { user: req.user || {} });
});

router.get('/change-password', ensureAuthenticated, requireUser, (req, res) => {
    res.render('change-password', { user: req.user });
});

module.exports = router;
