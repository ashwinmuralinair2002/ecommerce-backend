const crypto = require('crypto');
const Razorpay = require('razorpay');
const checkoutService = require('./checkout.service');
const AppError = require('../utils/AppError');
const { buildBuyNowCheckoutData } = require('../utils/buy-now-checkout');

const razorpayInstance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

const verifyRazorpaySignature = (orderId, paymentId, signature) => {
    const body = orderId + '|' + paymentId;
    const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(body.toString())
        .digest('hex');

    return expectedSignature === signature;
};

const createRazorpayOrder = async (userId, buyNowItem = null, req = null) => {
    try {
        if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
            throw new AppError('Razorpay is not configured', 500);
        }

        const checkoutData = buyNowItem
            ? await buildBuyNowCheckoutData(userId, buyNowItem, req)
            : await checkoutService.prepareCheckout(userId, req);

        if (!checkoutData || !checkoutData.pricing) {
            throw new Error('Invalid checkout state');
        }

        const finalTotal = Number(
            checkoutData
            && checkoutData.pricing
            && Number.isFinite(Number(checkoutData.pricing.finalTotal))
                ? checkoutData.pricing.finalTotal
                : 0
        );

        if (!finalTotal || finalTotal <= 0) {
            throw new AppError('Invalid order amount', 400);
        }

        const amountInPaise = Math.round(finalTotal * 100);
        let razorpayOrder;

        try {
            razorpayOrder = await razorpayInstance.orders.create({
                amount: amountInPaise,
                currency: 'INR',
                receipt: `u${userId.toString().slice(-6)}_${Date.now()}`,
                payment_capture: 1,
                notes: {
                    userId: userId.toString()
                }
            });
        } catch (err) {
            console.error('Razorpay order creation failed:', err);
            throw new Error('Failed to create Razorpay order');
        }

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
            error
            && (
                error.statusCode
                || error.error
                || error.status
                || error.message === 'Cart is empty'
                || error.message === 'Invalid cart items present'
                || error.message === 'No delivery address selected'
            )
        ) {
            throw new AppError(error.message || 'Failed to create Razorpay order', error.statusCode || 400);
        }

        throw new AppError('Failed to create Razorpay order', 500);
    }
};

module.exports = {
    razorpayInstance,
    createRazorpayOrder,
    verifyRazorpaySignature
};
