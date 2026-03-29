const express = require('express');
const { getHomePage } = require('../controllers/home.controller');
const { ensureAuthenticated, ensureOtpVerified } = require('../middleware/auth-check.middleware');
const redirectAdminHome = require('../middleware/admin-home-redirect.middleware');
const { requireUser } = require('../middleware/role-auth.middleware');

const router = express.Router();

router.get('/home', ensureAuthenticated, ensureOtpVerified, redirectAdminHome, requireUser, getHomePage);

module.exports = router;
