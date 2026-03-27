const express = require('express');
const cartController = require('../controllers/cart.controller');
const { ensureAuthenticated } = require('../middleware/auth-check.middleware');
const { validate } = require('../middleware/validate.middleware');
const {
  addToCartSchema,
  updateCartItemSchema,
  removeCartItemSchema
} = require('../validations/cart.validation');

const router = express.Router();

router.post('/cart/add', ensureAuthenticated, validate(addToCartSchema), cartController.addToCart);
router.get('/cart', ensureAuthenticated, cartController.getCart);
router.patch('/cart/item', ensureAuthenticated, validate(updateCartItemSchema), cartController.updateQuantity);
router.delete('/cart/item', ensureAuthenticated, validate(removeCartItemSchema), cartController.removeItem);

module.exports = router;
