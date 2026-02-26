const express = require('express');
const { getHomePage } = require('../controllers/home.controller');
const { ensureAuthenticated, ensureOtpVerified } = require('../middleware/auth-check.middleware');
const redirectAdminHome = require('../middleware/admin-home-redirect.middleware');

const router = express.Router();

router.get('/home', ensureAuthenticated, ensureOtpVerified, redirectAdminHome, getHomePage);

module.exports = router;
