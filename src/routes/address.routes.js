// Address management routes
const express = require('express');
const router = express.Router();
const { ensureAuthenticated } = require('../middleware/auth-check.middleware');
const addressController = require('../controllers/address.controller');

router.get('/account/addresses', ensureAuthenticated, addressController.getAddresses);
router.get('/account/addresses/new', ensureAuthenticated, addressController.renderAddAddress);
router.post('/account/addresses', ensureAuthenticated, addressController.addAddress);
router.post('/account/addresses/new', ensureAuthenticated, addressController.addAddress);
router.get('/account/addresses/:id/edit', ensureAuthenticated, addressController.renderEditAddress);
router.post('/account/addresses/:id/update', ensureAuthenticated, addressController.updateAddress);
router.post('/account/addresses/:id/delete', ensureAuthenticated, addressController.deleteAddress);

module.exports = router;
