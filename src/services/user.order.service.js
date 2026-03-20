const Order = require('../models/order.model');

const mapOrderSummary = (order) => ({
    orderId: order.orderId,
    totalAmount: order.totalAmount,
    totalItems: Array.isArray(order.items)
        ? order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
        : 0,
    orderStatus: order.orderStatus,
    createdAt: order.createdAt
});

const getUserOrders = async (userId) => {
    const orders = await Order.find({
        user: userId,
        deleted: { $ne: true }
    })
        .sort({ createdAt: -1 })
        .lean();

    return orders.map(mapOrderSummary);
};

const getUserOrderById = async (userId, orderId) => {
    const order = await Order.findOne({
        orderId,
        user: userId,
        deleted: { $ne: true }
    }).lean();

    if (!order) {
        return null;
    }

    return {
        orderId: order.orderId,
        items: order.items || [],
        pricing: order.pricing || {},
        shippingAddress: order.shippingAddress || {},
        orderStatus: order.orderStatus,
        paymentMethod: order.paymentMethod,
        totalAmount: order.totalAmount,
        createdAt: order.createdAt
    };
};

module.exports = {
    getUserOrders,
    getUserOrderById
};
