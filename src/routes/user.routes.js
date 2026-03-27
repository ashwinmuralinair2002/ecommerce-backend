const express = require('express');
const router = express.Router();
const userProductController = require('../controllers/user.product.controller');
const cartPageController = require('../controllers/cart.page.controller');
const checkoutController = require('../controllers/checkout.controller');
const invoiceController = require('../controllers/invoice.controller');
const orderPageController = require('../controllers/order.page.controller');
const userOrderController = require('../controllers/user.order.controller');
const wishlistController = require('../controllers/wishlist.controller');
const homeController = require('../controllers/home.controller');
const walletRoutes = require('./wallet.routes');
const paymentRoutes = require('./payment.routes');
const { ensureAuthenticated } = require('../middleware/auth-check.middleware');
const { validate } = require('../middleware/validate.middleware');
const {
  addToWishlistSchema,
  removeFromWishlistSchema,
  moveToCartSchema
} = require('../validations/wishlist.validation');

router.get('/api/search', userProductController.liveSearch);
router.get('/hero/redirect/:id', homeController.redirectHeroBanner);

// Product Listing
router.get('/products', userProductController.getAllProducts);
router.get('/shop', userProductController.getAllProducts);
router.get('/best-sellers', userProductController.getBestSellersPage);
router.get('/new-arrivals', userProductController.getNewArrivalsPage);
router.get('/todays-deals', userProductController.getTodaysDealsPage);
router.get('/brands', userProductController.getBrandsPage);
router.get('/brand/:id', userProductController.getBrandDetailPage);
router.get('/category/:id', userProductController.getCategoryDetailPage);

router.get('/cart', ensureAuthenticated, cartPageController.getCartPage);
router.get('/wishlist', ensureAuthenticated, wishlistController.getWishlistPage);
router.get('/wishlist/count', ensureAuthenticated, wishlistController.getWishlistCount);
router.post('/api/checkout/buy-now', ensureAuthenticated, checkoutController.buyNow);
router.post('/api/checkout/clear-buy-now', ensureAuthenticated, checkoutController.clearBuyNow);
router.get('/checkout', ensureAuthenticated, checkoutController.getCheckoutPage);
router.get('/payment-failure', ensureAuthenticated, (req, res) => {
  res.render('user/payment-failure');
});
router.get('/order-success', ensureAuthenticated, orderPageController.getOrderSuccessPage);
router.get('/orders', ensureAuthenticated, userOrderController.getUserOrdersPage);
router.get('/orders/:orderId', ensureAuthenticated, userOrderController.getUserOrderDetailsPage);
router.get('/api/invoice/:orderId', ensureAuthenticated, invoiceController.downloadInvoice);
router.use('/wallet', ensureAuthenticated, walletRoutes);
router.use('/payment', paymentRoutes);
router.post(
  '/wishlist/add',
  ensureAuthenticated,
  validate(addToWishlistSchema),
  wishlistController.addToWishlist
);
router.delete(
  '/wishlist/remove',
  ensureAuthenticated,
  validate(removeFromWishlistSchema),
  wishlistController.removeFromWishlist
);
router.patch(
  '/wishlist/move-to-cart',
  ensureAuthenticated,
  validate(moveToCartSchema),
  wishlistController.moveToCart
);

// Product Details
router.get('/product/:id', userProductController.getProductDetails);
router.get('/products/:id', userProductController.getProductDetails);

module.exports = router;
