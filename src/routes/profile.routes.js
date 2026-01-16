const express = require('express');
const { verifyToken } = require('../middleware/auth.middleware');
const {
    getProfile,
    updateProfile,
    requestEmailChange,
    verifyEmailChange,
    addAddress,
    updateAddress,
    deleteAddress,
    deleteAccount
} = require('../controllers/profile.controller');

const router = express.Router();

router.use(verifyToken); // Apply auth middleware to all profile routes

router.get('/', getProfile);
router.put('/', updateProfile);

router.post('/email/request', requestEmailChange);
router.post('/email/verify', verifyEmailChange);

router.post('/address', addAddress);
router.put('/address/:id', updateAddress);
router.delete('/address/:id', deleteAddress);

router.delete('/delete', deleteAccount);

module.exports = router;
