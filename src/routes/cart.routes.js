const express = require('express');
const cartController = require('../controllers/cart.controller');
const { ensureAuthenticated } = require('../middleware/auth-check.middleware');

const router = express.Router();

router.post('/cart/add', ensureAuthenticated, cartController.addToCart);
router.get('/cart', ensureAuthenticated, cartController.getCart);
router.patch('/cart/update-quantity', ensureAuthenticated, cartController.updateQuantity);
router.delete('/cart/remove', ensureAuthenticated, cartController.removeItem);

module.exports = router;
