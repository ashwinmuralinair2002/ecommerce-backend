const express = require('express');
const paymentController = require('../controllers/payment.controller');

const router = express.Router();

const ensureAuthenticatedApi = (req, res, next) => {
    if (req.session && req.session.userId) {
        return next();
    }

    return res.status(401).json({
        success: false,
        message: 'Authentication required'
    });
};

router.post('/create-order', ensureAuthenticatedApi, paymentController.createRazorpayOrderController);

module.exports = router;
