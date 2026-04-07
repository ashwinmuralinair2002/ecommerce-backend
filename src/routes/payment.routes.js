const express = require('express');
const paymentController = require('../controllers/payment.controller');
const { requireUser } = require('../middleware/role-auth.middleware');
const { paymentLimiter } = require('../middleware/rate-limit.middleware');
const HTTP_STATUS = require('../constants/http-status');
const MESSAGES = require('../constants/messages');

const router = express.Router();

const ensureAuthenticatedApi = (req, res, next) => {
    if (!req.user) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
            error: MESSAGES.AUTH_REQUIRED
        });
    }

    if (req.user.role !== 'user') {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
            success: false,
            message: 'User access required'
        });
    }

    return next();
};

router.post('/create-order', ensureAuthenticatedApi, requireUser, paymentLimiter, paymentController.createRazorpayOrderController);

module.exports = router;
