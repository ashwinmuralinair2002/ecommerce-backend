const express = require('express');
const orderController = require('../controllers/order.controller');
const { ensureAuthenticated } = require('../middleware/auth-check.middleware');
const { requireUser } = require('../middleware/role-auth.middleware');

const router = express.Router();

router.post('/order/place', ensureAuthenticated, requireUser, orderController.placeOrder);
router.patch('/order/:orderId/item/:itemId/cancel', ensureAuthenticated, requireUser, orderController.cancelOrderItem);
router.patch('/order/:orderId/item/:itemId/return', ensureAuthenticated, requireUser, orderController.requestReturn);

module.exports = router;
