const orderService = require('../services/order.service');

const placeOrder = async (req, res) => {
    try {
        const userId = req.session.userId;
        const orderId = await orderService.placeOrder(userId);

        return res.json({
            success: true,
            orderId
        });
    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

module.exports = {
    placeOrder
};
