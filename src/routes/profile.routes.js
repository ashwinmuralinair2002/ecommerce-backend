// User profile management routes
const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profile.controller');
const { handleProfileImageUpload } = require('../middleware/profile-upload.middleware');
const { ensureAuthenticated } = require('../middleware/auth-check.middleware');
const { requireUser } = require('../middleware/role-auth.middleware');
const { validate } = require('../middleware/validate.middleware');
const {
    updateProfileSchema,
    requestEmailChangeSchema
} = require('../validations/profile.validation');

router.use(ensureAuthenticated);
router.use(requireUser);

router.get('/', profileController.getProfile);
router.put('/', validate(updateProfileSchema), profileController.updateProfile);
router.post('/upload-photo', handleProfileImageUpload, profileController.uploadProfilePhoto);

router.post('/email/request', validate(requestEmailChangeSchema), profileController.requestEmailChange);
router.post('/email/verify', profileController.verifyEmailChange);

router.post('/password/request', profileController.requestPasswordChange);
router.post('/password/verify', profileController.verifyPasswordChange);
router.post('/password/resend', profileController.resendPasswordChangeOtp);

router.post('/address', profileController.addAddress);
router.put('/address/:id', profileController.updateAddress);
router.delete('/address/:id', profileController.deleteAddress);
router.delete('/delete', profileController.deleteAccount);

module.exports = router;
