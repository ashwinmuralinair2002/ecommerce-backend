const mongoose = require('mongoose');
const Cart = require('../models/cart.model');
const Order = require('../models/order.model');
const Product = require('../models/Product');
const checkoutService = require('./checkout.service');

const roundCurrency = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const generateOrderItemId = () => `ITEM-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const buildShippingAddress = (address) => {
    return {
        name: address.name,
        phone: address.phone,
        addressLine1: [address.houseNo, address.originalStreet || address.street].filter(Boolean).join(', '),
        city: address.city,
        state: address.state,
        pincode: address.zip || address.postalCode || ''
    };
};

const placeOrder = async (userId) => {
    const checkoutData = await checkoutService.prepareCheckout(userId);
    const orderId = `ORD-${Date.now()}`;

    try {
        const orderItems = [];

        for (const item of checkoutData.items) {
            const product = await Product.findById(item.product && item.product._id)
                .populate('brand', 'name');

            if (!product || product.isListed === false || product.isDeleted === true) {
                throw new Error('Invalid cart items present');
            }

            const variant = product.variants.id(item.variant && item.variant._id);
            const quantity = Number(item.quantity || 0);

            if (!variant || Number(variant.stockCount || 0) === 0 || quantity > 5) {
                throw new Error('Invalid cart items present');
            }

            if (Number(variant.stockCount || 0) < quantity) {
                throw new Error('Stock changed, please refresh');
            }

            const price = Number(item.product && typeof item.product.price === 'number' ? item.product.price : item.priceSnapshot || 0);
            const totalPrice = roundCurrency(price * quantity);
            const checkoutVariant = item && item.variant ? item.variant : {};
            const variantImages = Array.isArray(checkoutVariant.images) ? checkoutVariant.images : [];
            const variantImage = variantImages[0];
            const imageUrl = (variantImage && variantImage.url)
                ? variantImage.url
                : '/images/placeholder.png';
            const generatedItemId = generateOrderItemId();
            const brandName = product && product.brand && product.brand.name
                ? product.brand.name
                : '';

            orderItems.push({
                itemId: generatedItemId,
                productId: product._id,
                productName: product.title,
                brandName,
                variantId: variant._id,
                colorName: variant.colorName || '',
                quantity,
                price,
                totalPrice,
                imageUrl,
                status: 'pending'
            });

            variant.stockCount -= quantity;
            await product.save();
        }

        const order = new Order({
            orderId,
            user: userId,
            items: orderItems,
            pricing: checkoutData.pricing,
            shippingAddress: buildShippingAddress(checkoutData.address),
            paymentMethod: 'COD',
            orderStatus: 'pending',
            totalAmount: checkoutData.pricing.finalTotal
        });

        await order.save();

        await Cart.findOneAndUpdate(
            { userId },
            { $set: { items: [] } }
        );

        return order.orderId;
    } catch (error) {
        throw error;
    }
};

const cancelOrderItem = async (userId, orderId, itemId, reason) => {
    const session = await mongoose.startSession();

    try {
        let result = null;

        await session.withTransaction(async () => {
            const order = await Order.findOne({
                orderId,
                user: userId,
                deleted: { $ne: true }
            }).session(session);

            if (!order) {
                throw new Error('Order not found');
            }

            const hasStableItemIds = Array.isArray(order.items) && order.items.every((item) => item && item.itemId);

            if (!hasStableItemIds) {
                throw new Error('Cancellation not supported for this order');
            }

            const item = Array.isArray(order.items)
                ? order.items.find((orderItem) => orderItem.itemId === itemId)
                : null;

            if (!item) {
                throw new Error('Item not found');
            }

            if (item.status !== 'pending') {
                throw new Error('Item cannot be cancelled');
            }

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

            item.status = 'cancelled';
            item.cancellationReason = typeof reason === 'string'
                ? reason.trim().slice(0, 1000)
                : '';

            const allItemsCancelled = Array.isArray(order.items) && order.items.length > 0
                ? order.items.every((orderItem) => orderItem.status === 'cancelled')
                : false;
            const someItemsCancelled = Array.isArray(order.items)
                ? order.items.some((orderItem) => orderItem.status === 'cancelled')
                : false;

            if (allItemsCancelled) {
                order.orderStatus = 'cancelled';
            } else if (someItemsCancelled) {
                order.orderStatus = 'partially_cancelled';
            }

            await order.save({ session });

            result = {
                success: true,
                message: 'Item cancelled successfully',
                updatedOrderStatus: order.orderStatus
            };
        });

        return result;
    } catch (error) {
        throw error;
    } finally {
        await session.endSession();
    }
};

const requestReturn = async (userId, orderId, itemId, reason) => {
    const order = await Order.findOne({
        orderId,
        user: userId,
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

    if (['return_requested', 'returned', 'return_rejected'].includes(item.status)) {
        throw new Error('Return already processed for this item');
    }

    if (item.status !== 'delivered') {
        throw new Error('Return allowed only for delivered items');
    }

    if (!reason || typeof reason !== 'string' || !reason.trim()) {
        throw new Error('Return reason is required');
    }

    item.status = 'return_requested';
    item.returnReason = reason.trim().slice(0, 1000);

    await order.save();

    return {
        success: true,
        message: 'Return request submitted successfully'
    };
};

module.exports = {
    placeOrder,
    cancelOrderItem,
    requestReturn
};
