const express = require('express');
const { getPostLoginHomePage } = require('../controllers/home.controller');
const { ensureAuthenticated, ensureOtpVerified } = require('../middleware/auth-check.middleware');
const redirectAdminHome = require('../middleware/admin-home-redirect.middleware');

const router = express.Router();

router.get('/home', ensureAuthenticated, ensureOtpVerified, redirectAdminHome, getPostLoginHomePage);

module.exports = router;
