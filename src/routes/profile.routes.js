// User profile management routes
const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profile.controller');
const profileUpload = require('../middleware/profile-upload.middleware');
const { verifyToken } = require('../middleware/auth.middleware'); // Added back verifyToken import

router.use(verifyToken); // Apply auth middleware to all profile routes

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
