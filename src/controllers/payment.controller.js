const paymentService = require('../services/payment.service');

const createRazorpayOrderController = async (req, res) => {
    try {
        const userId = req.session && req.session.userId;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        const razorpayOrder = await paymentService.createRazorpayOrder(userId, req.session.buyNowItem || null);

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
