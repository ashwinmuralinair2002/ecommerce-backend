const mongoose = require('mongoose');
const Cart = require('../models/cart.model');
const Order = require('../models/order.model');
const Product = require('../models/Product');
const checkoutService = require('./checkout.service');
const AppError = require('../utils/AppError');

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
    try {
        const checkoutData = await checkoutService.prepareCheckout(userId);
        const orderId = `ORD-${Date.now()}`;
        const orderItems = [];

        for (const item of checkoutData.items) {
            const product = await Product.findById(item.product && item.product._id)
                .populate('brand', 'name');

            if (!product || product.isListed === false || product.isDeleted === true) {
                throw new AppError('Invalid cart items present', 400);
            }

            const variant = product.variants.id(item.variant && item.variant._id);
            const quantity = Number(item.quantity || 0);

            if (!variant || Number(variant.stockCount || 0) === 0 || quantity > 5) {
                throw new AppError('Invalid cart items present', 400);
            }

            if (Number(variant.stockCount || 0) < quantity) {
                throw new AppError('Stock changed, please refresh', 409);
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
        if (error instanceof AppError) {
            throw error;
        }

        throw new AppError('Order service failed', 500);
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
                throw new AppError('Order not found', 404);
            }

            const hasStableItemIds = Array.isArray(order.items) && order.items.every((item) => item && item.itemId);

            if (!hasStableItemIds) {
                throw new AppError('Cancellation not supported for this order', 409);
            }

            const item = Array.isArray(order.items)
                ? order.items.find((orderItem) => orderItem.itemId === itemId)
                : null;

            if (!item) {
                throw new AppError('Item not found', 404);
            }

            if (item.status !== 'pending') {
                throw new AppError('Item cannot be cancelled', 409);
            }

            const product = await Product.findById(item.productId).session(session);

            if (!product) {
                throw new AppError('Product not found', 404);
            }

            const variant = product.variants.id(item.variantId);

            if (!variant) {
                throw new AppError('Product variant not found', 404);
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
        if (error instanceof AppError) {
            throw error;
        }

        throw new AppError('Order service failed', 500);
    } finally {
        await session.endSession();
    }
};

const requestReturn = async (userId, orderId, itemId, reason) => {
    try {
        const order = await Order.findOne({
            orderId,
            user: userId,
            deleted: { $ne: true }
        });

        if (!order) {
            throw new AppError('Order not found', 404);
        }

        const item = Array.isArray(order.items)
            ? order.items.find((orderItem) => orderItem.itemId === itemId)
            : null;

        if (!item) {
            throw new AppError('Item not found', 404);
        }

        if (['return_requested', 'returned', 'return_rejected'].includes(item.status)) {
            throw new AppError('Return already processed for this item', 409);
        }

        if (item.status !== 'delivered') {
            throw new AppError('Return allowed only for delivered items', 409);
        }

        if (!reason || typeof reason !== 'string' || !reason.trim()) {
            throw new AppError('Return reason is required', 400);
        }

        item.status = 'return_requested';
        item.returnReason = reason.trim().slice(0, 1000);

        await order.save();

        return {
            success: true,
            message: 'Return request submitted successfully'
        };
    } catch (error) {
        if (error instanceof AppError) {
            throw error;
        }

        throw new AppError('Order service failed', 500);
    }
};

module.exports = {
    placeOrder,
    cancelOrderItem,
    requestReturn
};
