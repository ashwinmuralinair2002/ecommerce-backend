const express = require('express');
const paymentController = require('../controllers/payment.controller');
const { requireUser } = require('../middleware/role-auth.middleware');

const router = express.Router();

const ensureAuthenticatedApi = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required'
        });
    }

    if (req.user.role !== 'user') {
        return res.status(403).json({
            success: false,
            message: 'User access required'
        });
    }

    return next();
};

router.post('/create-order', ensureAuthenticatedApi, requireUser, paymentController.createRazorpayOrderController);

module.exports = router;
