const mongoose = require('mongoose');
const Order = require('../models/order.model');
const User = require('../models/user.model');
const Product = require('../models/Product');

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

const syncDeliveredItems = (order) => {
    if (!order || !Array.isArray(order.items)) {
        return;
    }

    order.items.forEach((item) => {
        if (item.status !== 'cancelled') {
            item.status = 'delivered';
        }
    });
};

const getAllOrders = async (filters = {}) => {
    const { search, status, sort, payment, price } = filters;
    const page = Math.max(parseInt(filters.page, 10) || 1, 1);
    const limit = Math.max(parseInt(filters.limit, 10) || 10, 1);
    const skip = (page - 1) * limit;
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

    const totalOrders = await Order.countDocuments(query);
    const totalPages = Math.ceil(totalOrders / limit);

    const orders = await Order.find(query)
        .populate('user', 'name email')
        .sort(sortOption)
        .skip(skip)
        .limit(limit)
        .lean();

    return {
        orders: orders.map((order) => ({
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
        })),
        totalOrders,
        currentPage: page,
        totalPages
    };
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

    if (order.orderStatus === 'returned' || order.orderStatus === 'partially_returned') {
        throw new Error('Returned orders cannot be updated');
    }

    if (newStatus === 'delivered') {
        syncDeliveredItems(order);
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
        if (
            order.orderStatus === 'delivered' ||
            order.orderStatus === 'cancelled' ||
            order.orderStatus === 'returned' ||
            order.orderStatus === 'partially_returned'
        ) {
            skippedCount += 1;
            continue;
        }

        if (!isValidBulkTransition(order.orderStatus, status)) {
            skippedCount += 1;
            continue;
        }

        if (status === 'delivered') {
            syncDeliveredItems(order);
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

const processReturn = async (orderId, itemId, action) => {
    if (!['approve', 'reject'].includes(action)) {
        throw new Error('Invalid action');
    }

    const session = await mongoose.startSession();

    try {
        let result = null;

        await session.withTransaction(async () => {
            const order = await Order.findOne({
                orderId,
                deleted: { $ne: true }
            }).session(session);

            if (!order) {
                throw new Error('Order not found');
            }

            const item = Array.isArray(order.items)
                ? order.items.find((orderItem) => orderItem.itemId === itemId)
                : null;

            if (!item) {
                throw new Error('Item not found');
            }

            if (['returned', 'return_rejected'].includes(item.status)) {
                throw new Error('Return already processed');
            }

            if (item.status !== 'return_requested') {
                throw new Error('Invalid return state');
            }

            if (action === 'approve') {
                const product = await Product.findById(item.productId).session(session);

                if (!product) {
                    throw new Error('Product not found');
                }

                const variant = product.variants.id(item.variantId);

                if (!variant) {
                    throw new Error('Product variant not found');
                }

                variant.stockCount += Number(item.quantity || 0);
                await product.save({ session });

                item.status = 'returned';
            } else {
                item.status = 'return_rejected';
            }

            const allItemsReturned = Array.isArray(order.items) && order.items.length > 0
                ? order.items.every((orderItem) => orderItem.status === 'returned')
                : false;
            const someItemsReturned = Array.isArray(order.items)
                ? order.items.some((orderItem) => orderItem.status === 'returned')
                : false;

            if (allItemsReturned) {
                order.orderStatus = 'returned';
            } else if (someItemsReturned) {
                order.orderStatus = 'partially_returned';
            }

            await order.save({ session });

            result = {
                success: true,
                message: action === 'approve' ? 'Return approved' : 'Return rejected',
                updatedStatus: item.status
            };
        });

        return result;
    } catch (error) {
        throw error;
    } finally {
        await session.endSession();
    }
};

const processItemStatusUpdate = async (orderId, itemId, newStatus) => {
    const allowedTransitions = {
        pending: 'shipped',
        shipped: 'delivered'
    };

    const order = await Order.findOne({
        orderId,
        deleted: { $ne: true }
    });

    if (!order) {
        throw new Error('Order not found');
    }

    const item = Array.isArray(order.items)
        ? order.items.find((orderItem) => orderItem.itemId === itemId)
        : null;

    if (!item) {
        throw new Error('Item not found');
    }

    if (['cancelled', 'returned', 'return_requested', 'return_rejected'].includes(item.status)) {
        throw new Error('Item status cannot be updated');
    }

    if (allowedTransitions[item.status] !== newStatus) {
        throw new Error('Invalid item status transition');
    }

    item.status = newStatus;

    if (newStatus === 'delivered') {
        const allItemsCompleted = Array.isArray(order.items) && order.items.length > 0
            ? order.items.every((orderItem) => ['delivered', 'cancelled', 'returned'].includes(orderItem.status))
            : false;

        if (allItemsCompleted) {
            order.orderStatus = 'delivered';
        }
    }

    await order.save();

    return {
        success: true,
        message: 'Item status updated successfully',
        updatedStatus: item.status,
        orderStatus: order.orderStatus
    };
};

module.exports = {
    getAllOrders,
    getOrderById,
    updateOrderStatus,
    bulkUpdateOrderStatus,
    processReturn,
    processItemStatusUpdate,
    ALLOWED_ORDER_STATUSES
};
