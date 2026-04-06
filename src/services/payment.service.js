const crypto = require('crypto');
const Razorpay = require('razorpay');
const AppError = require('../utils/AppError');
const HTTP_STATUS = require('../constants/http-status');

const RAZORPAY_INSTANCE_KEY = Symbol.for('app.razorpay.instance');

/**
 * Get Razorpay credentials safely (only when needed)
 */
const getRazorpayCredentials = () => {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
        throw new AppError(
            'Razorpay is not configured',
            HTTP_STATUS.INTERNAL_SERVER_ERROR
        );
    }

    return { keyId, keySecret };
};

/**
 * Lazy initialize Razorpay instance (singleton)
 */
const getRazorpayInstance = () => {
    if (globalThis[RAZORPAY_INSTANCE_KEY]) {
        return globalThis[RAZORPAY_INSTANCE_KEY];
    }

    const { keyId, keySecret } = getRazorpayCredentials();

    const instance = new Razorpay({
        key_id: keyId,
        key_secret: keySecret
    });

    globalThis[RAZORPAY_INSTANCE_KEY] = instance;

    return instance;
};

/**
 * Verify Razorpay signature
 */
const verifyRazorpaySignature = (orderId, paymentId, signature) => {
    const { keySecret } = getRazorpayCredentials();

    const body = orderId + '|' + paymentId;

    const expectedSignature = crypto
        .createHmac('sha256', keySecret)
        .update(body)
        .digest('hex');

    return expectedSignature === signature;
};

/**
 * Create Razorpay Order (fully lazy + safe)
 */
const createRazorpayOrder = async (userId, buyNowItem = null, req = null) => {
    try {
        // Load dependencies lazily (prevents circular + early execution)
        const checkoutService = require('./checkout.service');
        const { buildBuyNowCheckoutData } = require('../utils/buy-now-checkout');

        const checkoutData = buyNowItem
            ? await buildBuyNowCheckoutData(userId, buyNowItem, req)
            : await checkoutService.prepareCheckout(userId, req);

        if (!checkoutData || !checkoutData.pricing) {
            throw new Error('Invalid checkout state');
        }

        const finalTotal = Number(
            checkoutData?.pricing?.finalTotal || 0
        );

        if (!finalTotal || finalTotal <= 0) {
            throw new AppError(
                'Invalid order amount',
                HTTP_STATUS.BAD_REQUEST
            );
        }

        const amountInPaise = Math.round(finalTotal * 100);

        const razorpay = getRazorpayInstance();

        const razorpayOrder = await razorpay.orders.create({
            amount: amountInPaise,
            currency: 'INR',
            receipt: `u${userId.toString().slice(-6)}_${Date.now()}`,
            payment_capture: 1,
            notes: {
                userId: userId.toString()
            }
        });

        console.log('Razorpay order created:', razorpayOrder.id);

        return {
            razorpayOrderId: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency
        };

    } catch (error) {
        if (error instanceof AppError) {
            throw error;
        }

        if (
            error &&
            (
                error.statusCode ||
                error.error ||
                error.status ||
                error.message === 'Cart is empty' ||
                error.message === 'Invalid cart items present' ||
                error.message === 'No delivery address selected'
            )
        ) {
            throw new AppError(
                error.message || 'Failed to create Razorpay order',
                error.statusCode || 400
            );
        }

        throw new AppError(
            'Failed to create Razorpay order',
            HTTP_STATUS.INTERNAL_SERVER_ERROR
        );
    }
};

module.exports = {
    getRazorpayInstance,
    createRazorpayOrder,
    verifyRazorpaySignature
};
