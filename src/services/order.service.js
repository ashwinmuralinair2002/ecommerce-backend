const mongoose = require('mongoose');
const Cart = require('../models/cart.model');
const Order = require('../models/order.model');
const Product = require('../models/Product');
const checkoutService = require('./checkout.service');
const walletService = require('../services/wallet.service');
const AppError = require('../utils/AppError');
const { calculatePricing } = require('../utils/pricing-engine');

const roundCurrency = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const generateOrderItemId = () => `ITEM-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const distributeItemGst = (items, subtotal, gst) => {
    const safeSubtotal = Number.isFinite(Number(subtotal)) ? Number(subtotal) : 0;
    const safeGst = roundCurrency(Number.isFinite(Number(gst)) ? Number(gst) : 0);

    if (!Array.isArray(items) || items.length === 0) {
        return [];
    }

    if (safeGst === 0) {
        return items.map(() => 0);
    }

    if (items.length === 1) {
        return [safeGst];
    }

    if (safeSubtotal <= 0) {
        const allocations = items.map(() => 0);
        allocations[allocations.length - 1] = safeGst;

        return allocations;
    }

    let allocatedGst = 0;

    return items.map((item, index) => {
        if (index === items.length - 1) {
            return roundCurrency(safeGst - allocatedGst);
        }

        const itemTotal = Number.isFinite(Number(item && item.totalPrice)) ? Number(item.totalPrice) : 0;
        const itemShare = itemTotal / safeSubtotal;
        const itemGst = roundCurrency(itemShare * safeGst);
        allocatedGst = roundCurrency(allocatedGst + itemGst);

        return itemGst;
    });
};

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

const placeOrder = async (userId, paymentMethod, paymentData = {}) => {
    const session = await mongoose.startSession();

    try {
        session.startTransaction();

        const checkoutData = await checkoutService.prepareCheckout(userId);
        const pricingItems = Array.isArray(checkoutData && checkoutData.items)
            ? checkoutData.items.map((item) => ({
                priceSnapshot: Number(item.priceSnapshot ?? 0),
                quantity: Number(item.quantity || 0)
            }))
            : [];
        const pricing = calculatePricing(pricingItems);
        const finalTotal = Number(
            Number.isFinite(Number(pricing.finalTotal))
                ? pricing.finalTotal
                : 0
        );
        const normalizedPaymentMethod = typeof paymentMethod === 'string'
            ? paymentMethod.trim()
            : '';
        const resolvedPaymentMethod = normalizedPaymentMethod.toLowerCase() === 'cod'
            ? 'COD'
            : normalizedPaymentMethod;
        const isWalletPayment = normalizedPaymentMethod.toLowerCase() === 'wallet';
        const isOnlinePayment = normalizedPaymentMethod.toLowerCase() === 'online';
        const paymentStatus = isOnlinePayment || isWalletPayment ? 'paid' : 'pending';
        const razorpayPaymentId = isOnlinePayment && paymentData && paymentData.razorpayPaymentId
            ? String(paymentData.razorpayPaymentId)
            : null;
        const razorpayOrderId = isOnlinePayment && paymentData && paymentData.razorpayOrderId
            ? String(paymentData.razorpayOrderId)
            : null;
        const paymentCapturedAt = isOnlinePayment || isWalletPayment
            ? new Date()
            : null;
        const orderId = `ORD-${Date.now()}`;
        const referenceId = `ORDER_${Date.now()}_${userId}`;
        const orderItems = [];

        if (isWalletPayment) {
            const wallet = await walletService.getWallet(userId, session);

            if (!wallet || Number(wallet.balance || 0) < finalTotal) {
                throw new AppError('Insufficient wallet balance', 400);
            }
        }

        for (const item of checkoutData.items) {
            const product = await Product.findById(item.product && item.product._id)
                .session(session)
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

            if (!Number.isFinite(item.priceSnapshot)) {
                throw new AppError('Invalid price snapshot during order creation', 500);
            }

            const price = item.priceSnapshot;
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
            await product.save({ session });
        }

        const itemGstAllocations = distributeItemGst(
            orderItems,
            pricing.subtotal,
            pricing.gst
        );

        const pricedOrderItems = orderItems.map((item, index) => {
            const itemGst = Number.isFinite(Number(itemGstAllocations[index])) ? Number(itemGstAllocations[index]) : 0;
            const unitFinalPrice = Number(item.quantity) > 0
                ? roundCurrency((Number(item.totalPrice || 0) + itemGst) / Number(item.quantity))
                : 0;
            const finalPrice = roundCurrency(unitFinalPrice * Number(item.quantity || 0));

            return {
                ...item,
                gstAmount: itemGst,
                finalPrice,
                unitFinalPrice
            };
        });

        const order = new Order({
            orderId,
            user: userId,
            items: pricedOrderItems,
            pricing,
            shippingAddress: buildShippingAddress(checkoutData.address),
            paymentMethod: resolvedPaymentMethod || 'COD',
            paymentStatus,
            razorpayPaymentId,
            razorpayOrderId,
            paymentCapturedAt,
            orderStatus: 'pending',
            totalAmount: finalTotal
        });

        if (isWalletPayment) {
            try {
                await walletService.debitWallet(
                    userId,
                    finalTotal,
                    'purchase',
                    referenceId,
                    order.orderId,
                    session
                );
            } catch (err) {
                throw new AppError('Wallet payment failed. Order not placed.', 400);
            }
        }

        await order.save({ session });

        await Cart.findOneAndUpdate(
            { userId },
            { $set: { items: [] } },
            { session }
        );

        await session.commitTransaction();

        console.log(`Order ${order.orderId} created with payment: ${resolvedPaymentMethod || 'COD'}`);

        return order.orderId;
    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }

        if (error instanceof AppError) {
            throw error;
        }

        if (error && error.code === 11000 && isOnlinePayment) {
            throw new AppError('Order already exists for this payment', 409);
        }

        throw new AppError('Order service failed', 500);
    } finally {
        await session.endSession();
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

            if (item.refundStatus === 'processed') {
                throw new Error('Refund already processed');
            }

            item.refundStatus = 'pending';

            if (!Number.isFinite(item.finalPrice)) {
                throw new Error('Invalid finalPrice for refund');
            }

            const refundAmount = item.finalPrice;

            try {
                await walletService.creditWallet(
                    userId,
                    refundAmount,
                    'refund_cancelled',
                    String(item.itemId),
                    order.orderId
                );
            } catch (err) {
                throw new Error('Wallet refund failed. Cancellation aborted.');
            }

            item.refundStatus = 'processed';

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
