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

const cancelOrderItem = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { orderId, itemId } = req.params;
        const { reason = '' } = req.body;
        const result = await orderService.cancelOrderItem(userId, orderId, itemId, reason);

        return res.json(result);
    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

const requestReturn = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { orderId, itemId } = req.params;
        const { reason } = req.body;
        const result = await orderService.requestReturn(userId, orderId, itemId, reason);

        return res.json(result);
    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

module.exports = {
    placeOrder,
    cancelOrderItem,
    requestReturn
};
