const Order = require('../models/order.model');
const AppError = require('../utils/AppError');
const HTTP_STATUS = require('../constants/http-status');

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
    try {
        const {
            search = '',
            sort = 'newest',
            dateFilter = '',
            paymentMethod = '',
            page = 1,
            limit = 10
        } = options;
        const query = {
            user: userId,
            deleted: { $ne: true }
        };

        if (paymentMethod && ['online', 'wallet', 'COD'].includes(paymentMethod)) {
            query.paymentMethod = paymentMethod;
        }

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
        const currentPage = Math.max(Number(page) || 1, 1);
        const pageLimit = Math.max(Number(limit) || 10, 1);
        const skip = (currentPage - 1) * pageLimit;

        const [orders, totalOrders] = await Promise.all([
            Order.find(query)
                .sort(sortOption)
                .skip(skip)
                .limit(pageLimit)
                .lean(),
            Order.countDocuments(query)
        ]);

        return {
            orders: orders.map(mapOrderSummary),
            totalOrders,
            currentPage,
            totalPages: Math.max(Math.ceil(totalOrders / pageLimit), 1)
        };
    } catch (err) {
        if (err instanceof AppError) throw err;

        throw new AppError('User order service failed', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
};

const getUserOrderById = async (userId, orderId) => {
    try {
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
            pricing: order.pricing || null,
            coupon: order.coupon || null,
            shippingAddress: order.shippingAddress || {},
            orderStatus: order.orderStatus,
            paymentMethod: order.paymentMethod,
            totalAmount: order.totalAmount,
            createdAt: order.createdAt
        };
    } catch (err) {
        if (err instanceof AppError) throw err;

        throw new AppError('User order service failed', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
};

module.exports = {
    getUserOrders,
    getUserOrderById
};
