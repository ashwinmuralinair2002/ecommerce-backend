// Address management routes
const express = require('express');
const router = express.Router();
const { ensureAuthenticated } = require('../middleware/auth-check.middleware');
const { requireUser } = require('../middleware/role-auth.middleware');
const addressController = require('../controllers/address.controller');
const { validate } = require('../middleware/validate.middleware');
const {
  addAddressSchema,
  updateAddressSchema,
  deleteAddressSchema
} = require('../validations/address.validation');

router.get('/account/addresses', ensureAuthenticated, requireUser, addressController.getAddresses);
router.get('/account/addresses/new', ensureAuthenticated, requireUser, addressController.renderAddAddress);
router.post('/account/addresses', ensureAuthenticated, requireUser, validate(addAddressSchema), addressController.addAddress);
router.post('/account/addresses/new', ensureAuthenticated, requireUser, validate(addAddressSchema), addressController.addAddress);
router.get('/account/addresses/:id/edit', ensureAuthenticated, requireUser, addressController.renderEditAddress);
router.patch('/account/addresses/:id/update', ensureAuthenticated, requireUser, validate(updateAddressSchema), addressController.updateAddress);
router.post('/account/addresses/:id/delete', ensureAuthenticated, requireUser, validate(deleteAddressSchema), addressController.deleteAddress);

module.exports = router;
