// User profile management routes
const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profile.controller');
const profileUpload = require('../middleware/profile-upload.middleware');
const { ensureAuthenticated } = require('../middleware/auth-check.middleware');

router.use(ensureAuthenticated); // Apply strict session check to all profile routes

router.get('/', profileController.getProfile);
router.put('/', profileController.updateProfile);
router.post('/upload-photo', profileUpload.single('profileImage'), profileController.uploadProfilePhoto);

router.post('/email/request', profileController.requestEmailChange);
router.post('/email/verify', profileController.verifyEmailChange);

router.post('/password/request', profileController.requestPasswordChange);
router.post('/password/verify', profileController.verifyPasswordChange);
router.post('/password/resend', profileController.resendPasswordChangeOtp);

router.post('/address', profileController.addAddress);
router.put('/address/:id', profileController.updateAddress);
router.delete('/address/:id', profileController.deleteAddress);
router.delete('/delete', profileController.deleteAccount);

module.exports = router;
