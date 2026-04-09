const HTTP_STATUS = require('../constants/http-status');
const MESSAGES = require('../constants/messages');
const logger = require('../utils/logger');

const createRazorpayOrderController = async (req, res) => {
    try {
        const paymentService = require('../services/payment.service');
        const userId = req.session && req.session.userId;
        const checkoutContext = req.session && req.session.checkoutContext ? req.session.checkoutContext : null;

        if (!userId) {
            return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                error: MESSAGES.AUTH_REQUIRED
            });
        }

        if (checkoutContext && checkoutContext.type === 'cart') {
            req.session.checkoutContext = {
                type: 'cart'
            };
        }

        const razorpayOrder = await paymentService.createRazorpayOrder(
            userId,
            checkoutContext && checkoutContext.type === 'buyNow' && checkoutContext.item
                ? {
                    productId: checkoutContext.item.productId,
                    variantId: checkoutContext.item.variantId,
                    quantity: checkoutContext.item.quantity,
                    selectedOfferId: checkoutContext.item.selectedOfferId || null
                }
                : null,
            req
        );

        return res.json({
            success: true,
            data: razorpayOrder
        });
    } catch (error) {
        logger.error('Payment failed', {
            error: error.message,
            orderId: req.body?.orderId || null
        });

        return res.status(error.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: error.message || 'Failed to create Razorpay order'
        });
    }
};

module.exports = {
    createRazorpayOrderController
};
