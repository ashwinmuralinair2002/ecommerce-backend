const paymentService = require('../services/payment.service');

const createRazorpayOrderController = async (req, res) => {
    try {
        const userId = req.session && req.session.userId;
        const checkoutContext = req.session && req.session.checkoutContext ? req.session.checkoutContext : null;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
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
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Failed to create Razorpay order'
        });
    }
};

module.exports = {
    createRazorpayOrderController
};
