const express = require('express');
const router = express.Router();
const userProductController = require('../controllers/user.product.controller');
const cartPageController = require('../controllers/cart.page.controller');
const { ensureAuthenticated } = require('../middleware/auth-check.middleware');

router.get('/api/search', userProductController.liveSearch);

// Product Listing
router.get('/products', userProductController.getAllProducts);

router.get('/cart', ensureAuthenticated, cartPageController.getCartPage);

// Product Details
router.get('/product/:id', userProductController.getProductDetails);
router.get('/products/:id', userProductController.getProductDetails);

module.exports = router;
