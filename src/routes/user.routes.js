const express = require('express');
const router = express.Router();
const userProductController = require('../controllers/user.product.controller');
const cartPageController = require('../controllers/cart.page.controller');
const checkoutController = require('../controllers/checkout.controller');
const invoiceController = require('../controllers/invoice.controller');
const orderPageController = require('../controllers/order.page.controller');
const userOrderController = require('../controllers/user.order.controller');
const wishlistController = require('../controllers/wishlist.controller');
const { ensureAuthenticated } = require('../middleware/auth-check.middleware');

router.get('/api/search', userProductController.liveSearch);

// Product Listing
router.get('/products', userProductController.getAllProducts);

router.get('/cart', ensureAuthenticated, cartPageController.getCartPage);
router.get('/wishlist', ensureAuthenticated, wishlistController.getWishlistPage);
router.get('/wishlist/count', ensureAuthenticated, wishlistController.getWishlistCount);
router.get('/checkout', ensureAuthenticated, checkoutController.getCheckoutPage);
router.get('/order-success', ensureAuthenticated, orderPageController.getOrderSuccessPage);
router.get('/orders', ensureAuthenticated, userOrderController.getUserOrdersPage);
router.get('/orders/:orderId', ensureAuthenticated, userOrderController.getUserOrderDetailsPage);
router.get('/api/invoice/:orderId', ensureAuthenticated, invoiceController.downloadInvoice);
router.post('/wishlist/add', ensureAuthenticated, wishlistController.addToWishlist);
router.delete('/wishlist/remove', ensureAuthenticated, wishlistController.removeFromWishlist);
router.patch('/wishlist/move-to-cart', ensureAuthenticated, wishlistController.moveToCart);

// Product Details
router.get('/product/:id', userProductController.getProductDetails);
router.get('/products/:id', userProductController.getProductDetails);

module.exports = router;
