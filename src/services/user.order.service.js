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

const getDateThreshold = (dateFilter) => {
    if (!dateFilter) {
        return null;
    }

    const now = new Date();

    if (dateFilter === '7d') {
        now.setDate(now.getDate() - 7);
        return now;
    }

    if (dateFilter === '30d') {
        now.setDate(now.getDate() - 30);
        return now;
    }

    if (dateFilter === '6m') {
        now.setMonth(now.getMonth() - 6);
        return now;
    }

    if (dateFilter === '1y') {
        now.setFullYear(now.getFullYear() - 1);
        return now;
    }

    return null;
};

const getUserOrders = async (userId, options = {}) => {
    const { search = '', sort = 'newest', dateFilter = '' } = options;
    const query = {
        user: userId,
        deleted: { $ne: true }
    };

    if (search && search.trim()) {
        query.$or = [
            { 'items.productName': { $regex: search.trim(), $options: 'i' } },
            { 'items.brandName': { $regex: search.trim(), $options: 'i' } }
        ];
    }

    const dateThreshold = getDateThreshold(dateFilter);
    if (dateThreshold) {
        query.createdAt = { $gte: dateThreshold };
    }

    const sortOption = sort === 'oldest' ? { createdAt: 1 } : { createdAt: -1 };

    const orders = await Order.find(query)
        .sort(sortOption)
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
