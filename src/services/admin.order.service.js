const Order = require('../models/order.model');
const User = require('../models/user.model');

const ALLOWED_ORDER_STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
const ALLOWED_BULK_ORDER_STATUSES = ['shipped', 'delivered', 'cancelled'];

const isValidBulkTransition = (currentStatus, nextStatus) => {
    if (currentStatus === 'pending') {
        return nextStatus === 'shipped' || nextStatus === 'cancelled';
    }

    if (currentStatus === 'shipped') {
        return nextStatus === 'delivered';
    }

    return false;
};

const formatUserInfo = (user) => {
    if (!user) {
        return null;
    }

    return {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone
    };
};

const getAllOrders = async (filters = {}) => {
    const { search, status, sort, payment, price } = filters;
    const query = { deleted: { $ne: true } };

    if (status && status !== 'all') {
        query.orderStatus = status;
    }

    if (payment && payment !== 'all') {
        query.paymentMethod = payment;
    }

    if (price && price !== 'all') {
        if (price === 'lt1000') {
            query.totalAmount = { $lt: 1000 };
        } else if (price === '1000-3000') {
            query.totalAmount = { $gte: 1000, $lte: 3000 };
        } else if (price === '3000-5000') {
            query.totalAmount = { $gte: 3000, $lte: 5000 };
        } else if (price === '5000-10000') {
            query.totalAmount = { $gte: 5000, $lte: 10000 };
        } else if (price === 'gt10000') {
            query.totalAmount = { $gt: 10000 };
        }
    }

    if (search && search.trim()) {
        const searchRegex = new RegExp(search.trim(), 'i');
        const matchingUsers = await User.find(
            {
                $or: [
                    { name: { $regex: searchRegex } },
                    { email: { $regex: searchRegex } }
                ]
            },
            { _id: 1 }
        ).lean();
        const matchingUserIds = matchingUsers.map((user) => user._id);

        query.$or = [
            { orderId: { $regex: searchRegex } },
            { user: { $in: matchingUserIds } }
        ];
    }

    let sortOption = { createdAt: -1 };

    if (sort === 'oldest') {
        sortOption = { createdAt: 1 };
    }

    if (sort === 'amount_high') {
        sortOption = { totalAmount: -1 };
    }

    if (sort === 'amount_low') {
        sortOption = { totalAmount: 1 };
    }

    const orders = await Order.find(query)
        .populate('user', 'name email')
        .sort(sortOption)
        .lean();

    return orders.map((order) => ({
        orderId: order.orderId,
        totalAmount: order.totalAmount,
        totalItems: Array.isArray(order.items)
            ? order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
            : 0,
        paymentMethod: order.paymentMethod,
        orderStatus: order.orderStatus,
        createdAt: order.createdAt,
        userName: order.user && order.user.name ? order.user.name : 'Unknown User',
        email: order.user && order.user.email ? order.user.email : ''
    }));
};

const getOrderById = async (orderId) => {
    const order = await Order.findOne({ orderId, deleted: { $ne: true } })
        .populate('user', 'name email phone')
        .lean();

    if (!order) {
        throw new Error('Order not found');
    }

    return {
        orderId: order.orderId,
        items: order.items || [],
        pricing: order.pricing,
        shippingAddress: order.shippingAddress,
        orderStatus: order.orderStatus,
        paymentMethod: order.paymentMethod,
        totalAmount: order.totalAmount,
        createdAt: order.createdAt,
        user: formatUserInfo(order.user)
    };
};

const updateOrderStatus = async (orderId, newStatus) => {
    if (!ALLOWED_ORDER_STATUSES.includes(newStatus)) {
        throw new Error('Invalid order status');
    }

    const order = await Order.findOne({ orderId, deleted: { $ne: true } });

    if (!order) {
        throw new Error('Order not found');
    }

    const allItemsCancelled = Array.isArray(order.items) && order.items.length > 0
        ? order.items.every((item) => item.status === 'cancelled')
        : false;

    if (allItemsCancelled) {
        throw new Error('Cannot update a fully cancelled order');
    }

    if (order.orderStatus === 'cancelled') {
        throw new Error('Cancelled orders cannot be updated');
    }

    if (order.orderStatus === 'delivered') {
        throw new Error('Delivered orders cannot be updated');
    }

    order.orderStatus = newStatus;
    await order.save();

    return {
        orderId: order.orderId,
        orderStatus: order.orderStatus
    };
};

const bulkUpdateOrderStatus = async (orderIds, status) => {
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
        throw new Error('No orders selected');
    }

    if (!ALLOWED_BULK_ORDER_STATUSES.includes(status)) {
        throw new Error('Invalid bulk order status');
    }

    const uniqueOrderIds = [...new Set(orderIds.filter(Boolean))];
    const orders = await Order.find({
        orderId: { $in: uniqueOrderIds },
        deleted: { $ne: true }
    });

    let updatedCount = 0;
    let skippedCount = 0;

    const foundOrderIds = new Set(orders.map((order) => order.orderId));
    skippedCount += uniqueOrderIds.filter((orderId) => !foundOrderIds.has(orderId)).length;

    for (const order of orders) {
        if (order.orderStatus === 'delivered' || order.orderStatus === 'cancelled') {
            skippedCount += 1;
            continue;
        }

        if (!isValidBulkTransition(order.orderStatus, status)) {
            skippedCount += 1;
            continue;
        }

        order.orderStatus = status;
        await order.save();
        updatedCount += 1;
    }

    return {
        updatedCount,
        skippedCount
    };
};

module.exports = {
    getAllOrders,
    getOrderById,
    updateOrderStatus,
    bulkUpdateOrderStatus,
    ALLOWED_ORDER_STATUSES
};
