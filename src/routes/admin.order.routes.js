const express = require('express');
const { ensureAdminAuthenticated } = require('../middleware/admin-auth.middleware');
const adminOrderController = require('../controllers/admin.order.controller');

const router = express.Router();

router.use(ensureAdminAuthenticated);

router.get('/orders-page', adminOrderController.renderOrdersPage);
router.get('/orders', adminOrderController.getOrders);
router.get('/orders/:orderId/json', adminOrderController.getOrderDetails);
router.get('/orders/:orderId/page', adminOrderController.renderOrderDetailsPage);
router.get('/orders/:orderId', adminOrderController.renderOrderDetailsPage);
router.patch('/orders/bulk-status', adminOrderController.bulkUpdateStatus);
router.patch('/orders/:orderId/status', adminOrderController.updateStatus);
router.patch('/orders/:orderId/item/:itemId/status', adminOrderController.updateItemStatus);
router.patch('/orders/:orderId/item/:itemId/return', adminOrderController.processReturn);

module.exports = router;
