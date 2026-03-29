const mongoose = require('mongoose');
const Cart = require('../models/cart.model');
const Coupon = require('../models/coupon.model');
const CouponUsage = require('../models/coupon-usage.model');
const Order = require('../models/order.model');
const Offer = require('../models/offer.model');
const Product = require('../models/Product');
const checkoutService = require('./checkout.service');
const walletService = require('../services/wallet.service');
const AppError = require('../utils/AppError');
const { getCachedOffers } = require('../utils/offer-cache');
const { calculatePricing } = require('../utils/pricing-engine');

const roundCurrency = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const generateOrderItemId = () => `ITEM-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const buildPricingItemKey = (item) => (
    `${String(item?.productId)}:${String(item?.selectedOfferId || 'default')}:${String(item?.priceSnapshot)}`
);

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

const placeOrder = async (userId, paymentMethod, paymentData = {}, req = null) => {
    const session = await mongoose.startSession();
    const normalizedPaymentMethod = typeof paymentMethod === 'string'
        ? paymentMethod.trim()
        : '';
    const isOnlinePayment = normalizedPaymentMethod.toLowerCase() === 'online';

    try {
        session.startTransaction();

        const checkoutData = await checkoutService.prepareCheckout(userId, req);
        const pricing = checkoutData && checkoutData.pricing ? checkoutData.pricing : {};
        const finalTotal = Number(
            Number.isFinite(Number(pricing.finalTotal))
                ? pricing.finalTotal
                : 0
        );
        const couponCodeRaw = req?.body?.couponCode || req?.query?.couponCode || null;
        const couponCode = couponCodeRaw
            ? String(couponCodeRaw).trim().toUpperCase()
            : null;
        const appliedCoupon = couponCode
            ? await Coupon.findOne({ code: couponCode, isDeleted: false }).session(session)
            : null;
        const resolvedPaymentMethod = normalizedPaymentMethod.toLowerCase() === 'cod'
            ? 'COD'
            : normalizedPaymentMethod;
        const isWalletPayment = normalizedPaymentMethod.toLowerCase() === 'wallet';
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
        const activeOffers = await getCachedOffers(Offer);
        const pricingItems = Array.isArray(checkoutData.items)
            ? checkoutData.items.map((item) => ({
                priceSnapshot: item.priceSnapshot != null
                    ? Number(item.priceSnapshot)
                    : 0,
                quantity: Number(item.quantity || 0),
                productId: item.product?._id || null,
                categoryId: item.product?.category?._id || item.product?.category || null,
                brandId: item.product?.brand?._id || item.product?.brand || null,
                selectedOfferId: item.selectedOfferId || null
            }))
            : [];
        const detailedPricing = await calculatePricing(pricingItems, activeOffers, appliedCoupon, userId);
        const resolvedPricing = detailedPricing && Array.isArray(detailedPricing.itemsDetailed) && detailedPricing.itemsDetailed.length === pricingItems.length
            ? detailedPricing
            : pricing;
        const resolvedFinalTotal = Number(
            Number.isFinite(Number(resolvedPricing.finalTotal))
                ? resolvedPricing.finalTotal
                : finalTotal
        );

        if (isWalletPayment) {
            const wallet = await walletService.getWallet(userId, session);

            if (!wallet || Number(wallet.balance || 0) < resolvedFinalTotal) {
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

        const detailedItems = Array.isArray(resolvedPricing.itemsDetailed)
            ? resolvedPricing.itemsDetailed
            : [];
        const detailedMap = new Map(
            detailedItems.map((item) => [buildPricingItemKey(item), item])
        );
        const pricedOrderItems = orderItems.map((item, index) => {
            const detailedItem = detailedMap.get(buildPricingItemKey({
                productId: item.productId,
                selectedOfferId: checkoutData.items[index]?.selectedOfferId || null,
                priceSnapshot: item.price
            })) || null;

            if (!detailedItem) {
                throw new AppError('Missing pricing data for order item', 500);
            }

            if (!item.quantity || Number(item.quantity) <= 0) {
                throw new AppError('Invalid item quantity in order creation', 500);
            }

            const offerDiscount = roundCurrency(Number(detailedItem.offerDiscountTotal || 0));
            const couponDiscount = roundCurrency(Number(detailedItem.couponDiscountShare || 0));
            const finalSubtotal = Math.max(0, roundCurrency(Number(detailedItem.finalSubtotal || 0)));
            const gstAmount = Math.max(0, roundCurrency(Number(detailedItem.gstAmount || 0)));
            const finalPrice = Math.max(0, roundCurrency(Number(detailedItem.finalPrice || 0)));

            if (
                !Number.isFinite(offerDiscount)
                || !Number.isFinite(couponDiscount)
                || !Number.isFinite(finalSubtotal)
                || !Number.isFinite(gstAmount)
                || !Number.isFinite(finalPrice)
            ) {
                throw new AppError('Invalid final price computed', 500);
            }

            const unitFinalPrice = roundCurrency(finalPrice / Number(item.quantity));

            if (!Number.isFinite(unitFinalPrice) || unitFinalPrice < 0) {
                throw new AppError('Invalid final price computed', 500);
            }

            return {
                ...item,
                offerDiscount,
                couponDiscount,
                finalSubtotal,
                gstAmount,
                finalPrice,
                unitFinalPrice
            };
        });
        const summedOfferDiscount = roundCurrency(pricedOrderItems.reduce((sum, item) => {
            return sum + Number(item.offerDiscount || 0);
        }, 0));
        const summedCouponDiscount = roundCurrency(pricedOrderItems.reduce((sum, item) => {
            return sum + Number(item.couponDiscount || 0);
        }, 0));
        const summedFinalPrice = roundCurrency(pricedOrderItems.reduce((sum, item) => {
            return sum + Number(item.finalPrice || 0);
        }, 0));
        const expectedOfferDiscountTotal = roundCurrency(Number(resolvedPricing.offerDiscountTotal || 0));
        const expectedCouponDiscountTotal = roundCurrency(Number(resolvedPricing.couponDiscount || 0));
        const expectedFinalTotal = roundCurrency(Number(resolvedPricing.finalTotal || 0));

        if (
            summedOfferDiscount !== expectedOfferDiscountTotal
            || summedCouponDiscount !== expectedCouponDiscountTotal
            || summedFinalPrice !== expectedFinalTotal
        ) {
            throw new AppError('Order pricing mismatch during order creation', 500);
        }

        const order = new Order({
            orderId,
            user: userId,
            items: pricedOrderItems,
            pricing: resolvedPricing,
            shippingAddress: buildShippingAddress(checkoutData.address),
            paymentMethod: resolvedPaymentMethod || 'COD',
            paymentStatus,
            razorpayPaymentId,
            razorpayOrderId,
            paymentCapturedAt,
            orderStatus: 'pending',
            totalAmount: expectedFinalTotal
        });

        order.set('coupon', appliedCoupon
            ? {
                code: appliedCoupon.code,
                discountType: appliedCoupon.discountType,
                discountValue: appliedCoupon.discountValue
            }
            : null, { strict: false });
        order.set('couponDiscount', Number(resolvedPricing.couponDiscount || 0), { strict: false });
        order.set('offerDiscountTotal', Number(resolvedPricing.offerDiscountTotal || 0), { strict: false });

        if (isWalletPayment) {
            try {
                await walletService.debitWallet(
                    userId,
                    expectedFinalTotal,
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

        if (appliedCoupon && appliedCoupon._id && resolvedPricing.couponApplied) {
            const usageSession = await mongoose.startSession();

            try {
                await usageSession.withTransaction(async () => {
                    const usageCount = await CouponUsage.countDocuments({
                        couponId: appliedCoupon._id,
                        userId
                    }).session(usageSession);

                    if (
                        appliedCoupon.usagePerUser
                        && usageCount >= appliedCoupon.usagePerUser
                    ) {
                        throw new Error('USER_LIMIT_EXCEEDED');
                    }

                    let usageInserted = false;

                    try {
                        await CouponUsage.create([{
                            couponId: appliedCoupon._id,
                            userId,
                            orderId: order._id
                        }], { session: usageSession });
                        usageInserted = true;
                    } catch (error) {
                        if (error?.code !== 11000) {
                            throw error;
                        }
                    }

                    if (usageInserted) {
                        await Coupon.updateOne(
                            { _id: appliedCoupon._id },
                            { $inc: { usedCount: 1 } },
                            { session: usageSession }
                        );
                    }
                });
            } catch (error) {
                if (error?.message === 'USER_LIMIT_EXCEEDED') {
                    throw new AppError('Coupon usage limit reached for your account', 400);
                }

                console.warn('Failed to record coupon usage after order creation', {
                    couponId: appliedCoupon._id,
                    userId,
                    orderId: order._id,
                    error: error?.message || error
                });
            } finally {
                await usageSession.endSession();
            }
        }

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
                throw new AppError('Item already refunded', 400);
            }

            if (item.refundStatus === 'processing') {
                throw new AppError('Refund already in progress', 409);
            }

            if (
                String(order.paymentMethod || '').toUpperCase() === 'COD'
                && String(order.paymentStatus || '').toLowerCase() !== 'paid'
            ) {
                throw new AppError('Refund not allowed for unpaid COD orders', 400);
            }

            if (!Number.isFinite(Number(item.finalPrice)) || Number(item.finalPrice) < 0) {
                throw new AppError('Invalid refund amount', 500);
            }

            const refundAmount = Number(item.finalPrice);
            const transactionRef = `refund:${order.orderId}:${item.itemId}`;

            console.log('REFUND DEBUG:', {
                itemId,
                finalPrice: item.finalPrice,
                offerDiscount: item.offerDiscount,
                couponDiscount: item.couponDiscount,
                gstAmount: item.gstAmount
            });

            item.refundStatus = 'processing';
            await order.save({ session, validateBeforeSave: false });

            try {
                await walletService.creditWallet(
                    userId,
                    refundAmount,
                    'refund_cancelled',
                    transactionRef,
                    order.orderId
                );
            } catch (err) {
                item.refundStatus = 'failed';
                await order.save({ session, validateBeforeSave: false });
                throw new AppError('Wallet refund failed. Cancellation aborted.', 500);
            }

            item.refundStatus = 'processed';
            item.refundedAt = new Date();

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
