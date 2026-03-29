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
const { requireUser } = require('../middleware/role-auth.middleware');
const redirectAdminHome = require('../middleware/admin-home-redirect.middleware');
const { validate } = require('../middleware/validate.middleware');
const {
  addToWishlistSchema,
  removeFromWishlistSchema,
  moveToCartSchema
} = require('../validations/wishlist.validation');

router.use(redirectAdminHome);

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

router.get('/cart', ensureAuthenticated, requireUser, cartPageController.getCartPage);
router.get('/wishlist', ensureAuthenticated, requireUser, wishlistController.getWishlistPage);
router.get('/wishlist/count', ensureAuthenticated, requireUser, wishlistController.getWishlistCount);
router.post('/api/checkout/buy-now', ensureAuthenticated, requireUser, checkoutController.buyNow);
router.post('/api/checkout/clear-buy-now', ensureAuthenticated, requireUser, checkoutController.clearBuyNow);
router.get('/checkout', ensureAuthenticated, requireUser, checkoutController.getCheckoutPage);
router.get('/checkout/buy-now', ensureAuthenticated, requireUser, checkoutController.getBuyNowCheckoutPage);
router.get('/checkout/retry', ensureAuthenticated, requireUser, checkoutController.retryCheckout);
router.get('/payment-failure', ensureAuthenticated, requireUser, (req, res) => {
  res.render('user/payment-failure');
});
router.get('/order-success', ensureAuthenticated, requireUser, orderPageController.getOrderSuccessPage);
router.get('/orders', ensureAuthenticated, requireUser, userOrderController.getUserOrdersPage);
router.get('/orders/:orderId', ensureAuthenticated, requireUser, userOrderController.getUserOrderDetailsPage);
router.get('/api/invoice/:orderId', ensureAuthenticated, requireUser, invoiceController.downloadInvoice);
router.use('/wallet', ensureAuthenticated, requireUser, walletRoutes);
router.use('/payment', ensureAuthenticated, requireUser, paymentRoutes);
router.post(
  '/wishlist/add',
  ensureAuthenticated,
  requireUser,
  validate(addToWishlistSchema),
  wishlistController.addToWishlist
);
router.delete(
  '/wishlist/remove',
  ensureAuthenticated,
  requireUser,
  validate(removeFromWishlistSchema),
  wishlistController.removeFromWishlist
);
router.patch(
  '/wishlist/move-to-cart',
  ensureAuthenticated,
  requireUser,
  validate(moveToCartSchema),
  wishlistController.moveToCart
);

// Product Details
router.get('/product/:id', userProductController.getProductDetails);
router.get('/products/:id', userProductController.getProductDetails);

module.exports = router;
