const express = require('express');
const { ensureAuthenticated } = require('../middleware/auth-check.middleware');

const router = express.Router();

router.get('/', ensureAuthenticated, (req, res) => {
    res.render('user-account', { user: req.user || {} });
});

router.get('/change-password', ensureAuthenticated, (req, res) => {
    res.render('change-password', { user: req.user });
});

module.exports = router;
