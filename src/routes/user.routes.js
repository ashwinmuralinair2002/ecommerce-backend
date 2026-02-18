const express = require('express');
const router = express.Router();
const userProductController = require('../controllers/user.product.controller');

// Product Listing
router.get('/products', userProductController.getAllProducts);

// Product Details
router.get('/product/:id', userProductController.getProductDetails);
router.get('/products/:id', userProductController.getProductDetails);

module.exports = router;
