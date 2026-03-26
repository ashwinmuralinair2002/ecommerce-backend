// Address management routes
const express = require('express');
const router = express.Router();
const { ensureAuthenticated } = require('../middleware/auth-check.middleware');
const addressController = require('../controllers/address.controller');
const { validate } = require('../middleware/validate.middleware');
const {
  addAddressSchema,
  updateAddressSchema,
  deleteAddressSchema
} = require('../validations/address.validation');

router.get('/account/addresses', ensureAuthenticated, addressController.getAddresses);
router.get('/account/addresses/new', ensureAuthenticated, addressController.renderAddAddress);
router.post('/account/addresses', ensureAuthenticated, validate(addAddressSchema), addressController.addAddress);
router.post('/account/addresses/new', ensureAuthenticated, validate(addAddressSchema), addressController.addAddress);
router.get('/account/addresses/:id/edit', ensureAuthenticated, addressController.renderEditAddress);
router.patch('/account/addresses/:id/update', ensureAuthenticated, validate(updateAddressSchema), addressController.updateAddress);
router.post('/account/addresses/:id/delete', ensureAuthenticated, validate(deleteAddressSchema), addressController.deleteAddress);

module.exports = router;
