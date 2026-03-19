const express = require('express');
const orderController = require('../controllers/order.controller');
const { ensureAuthenticated } = require('../middleware/auth-check.middleware');

const router = express.Router();

router.post('/order/place', ensureAuthenticated, orderController.placeOrder);

module.exports = router;
