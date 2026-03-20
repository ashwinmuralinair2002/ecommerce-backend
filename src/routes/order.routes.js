const express = require('express');
const orderController = require('../controllers/order.controller');
const { ensureAuthenticated } = require('../middleware/auth-check.middleware');

const router = express.Router();

router.post('/order/place', ensureAuthenticated, orderController.placeOrder);
router.patch('/order/:orderId/item/:itemId/cancel', ensureAuthenticated, orderController.cancelOrderItem);
router.patch('/order/:orderId/item/:itemId/return', ensureAuthenticated, orderController.requestReturn);

module.exports = router;
