const { z } = require('zod');
const Cart = require('../models/cart.model');
const Order = require('../models/order.model');
const Payment = require('../models/payment.model');
const orderService = require('../services/order.service');
const { buildBuyNowCartItem } = require('../utils/buy-now-checkout');
const HTTP_STATUS = require('../constants/http-status');
const MESSAGES = require('../constants/messages');
const logger = require('../utils/logger');

const baseSchema = z.object({
    paymentMethod: z.preprocess((value) => {
        if (typeof value !== 'string') {
            return value;
        }

        const normalizedValue = value.trim().toLowerCase();

        if (normalizedValue === 'cod') {
            return 'COD';
        }

        if (normalizedValue === 'wallet') {
            return 'wallet';
        }

        if (normalizedValue === 'online') {
            return 'online';
        }

        return value;
    }, z.enum(['COD', 'wallet', 'online']).optional())
});

const onlineSchema = z.object({
    razorpay_payment_id: z.string().min(1),
    razorpay_order_id: z.string().min(1),
    razorpay_signature: z.string().min(1)
});

const placeOrder = async (req, res) => {
    try {
        const userId = req.session.userId;
        const checkoutContext = req.session.checkoutContext || null;
        const {
            paymentMethod,
            razorpay_payment_id,
            razorpay_order_id,
            razorpay_signature
        } = req.body;
        const baseParse = baseSchema.safeParse(req.body);

        if (!baseParse.success) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: 'Invalid payment method'
            });
        }

        const parsedPaymentMethod = baseParse.data.paymentMethod || 'COD';
        const buyNowItem = checkoutContext && checkoutContext.type === 'buyNow' && checkoutContext.item
            ? {
                productId: checkoutContext.item.productId,
                variantId: checkoutContext.item.variantId,
                quantity: checkoutContext.item.quantity,
                selectedOfferId: checkoutContext.item.selectedOfferId || null
            }
            : null;

        if (parsedPaymentMethod === 'online') {
            const { verifyRazorpaySignature } = require('../services/payment.service');
            const onlineParse = onlineSchema.safeParse(req.body);

            if (!onlineParse.success) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    message: 'Invalid payment data'
                });
            }

            if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    message: 'Missing payment verification data'
                });
            }

            const existingOrder = await Order.findOne({
                razorpayPaymentId: razorpay_payment_id
            }).select('orderId').lean();

            if (existingOrder) {
                console.warn('Duplicate online payment attempt:', razorpay_payment_id);
                delete req.session.buyNowItem;
                delete req.session.checkoutContext;
                return res.json({
                    success: true,
                    message: 'Order already processed',
                    orderId: existingOrder.orderId
                });
            }

            const isValid = verifyRazorpaySignature(
                razorpay_order_id,
                razorpay_payment_id,
                razorpay_signature
            );

            if (!isValid) {
                console.warn('Payment verification failed:', razorpay_payment_id);
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    message: MESSAGES.PAYMENT_VERIFICATION_FAILED
                });
            }

            console.log('Payment verified:', razorpay_payment_id);

            let payment = await Payment.findOne({
                razorpayPaymentId: razorpay_payment_id
            });
            // load any persisted payment record for this Razorpay payment id

            if (payment && payment.razorpayOrderId !== razorpay_order_id) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    message: MESSAGES.PAYMENT_ORDER_MISMATCH
                });
            }
            // reject retries that try to reuse the same payment id with a different Razorpay order

            if (!payment) {
                try {
                    payment = await Payment.create({
                        razorpayPaymentId: razorpay_payment_id,
                        razorpayOrderId: razorpay_order_id,
                        status: 'pending'
                    });
                } catch (error) {
                    if (error?.code === 11000) {
                        payment = await Payment.findOne({
                            razorpayPaymentId: razorpay_payment_id
                        });
                    } else {
                        throw error;
                    }
                }
            }
            // persist a pending payment before order creation so failed attempts can retry safely

            if (payment && payment.status === 'completed') {
                const completedOrder = await Order.findOne({
                    razorpayPaymentId: razorpay_payment_id
                }).select('orderId').lean();
                // completed payment should map to the already created order

                if (completedOrder) {
                    delete req.session.buyNowItem;
                    delete req.session.checkoutContext;
                    return res.json({
                        success: true,
                        message: 'Order already processed',
                        orderId: completedOrder.orderId
                    });
                }

                return res.status(HTTP_STATUS.CONFLICT).json({
                    success: false,
                    message: 'Payment already processed'
                });
            }
            // if payment is still pending we allow safe order-creation retry with the same payment id

            req.paymentData = {
                razorpayPaymentId: razorpay_payment_id,
                razorpayOrderId: razorpay_order_id
            };
        }
        let orderId;

        if (buyNowItem) {
            const existingCart = await Cart.findOne({ userId }).lean();
            const originalItems = existingCart && Array.isArray(existingCart.items) ? existingCart.items : [];
            const tempCartItem = await buildBuyNowCartItem(buyNowItem);

            await Cart.findOneAndUpdate(
                { userId },
                { $set: { items: [tempCartItem] } },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );

            try {
                orderId = await orderService.placeOrder(userId, parsedPaymentMethod, req.paymentData, req);
            } finally {
                await Cart.findOneAndUpdate(
                    { userId },
                    { $set: { items: originalItems } },
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                );
            }
        } else {
            orderId = await orderService.placeOrder(userId, parsedPaymentMethod, req.paymentData, req);
        }

        if (parsedPaymentMethod === 'online' && req.paymentData?.razorpayPaymentId) {
            await Payment.updateOne(
                { razorpayPaymentId: req.paymentData.razorpayPaymentId },
                {
                    $set: {
                        razorpayOrderId: req.paymentData.razorpayOrderId,
                        status: 'completed'
                    }
                }
            );

            logger.info('Payment successful', { orderId });
        }
        // mark payment completed only after the order has been created successfully

        delete req.session.buyNowItem;
        delete req.session.checkoutContext;

        logger.info('Order placed', { orderId, userId });

        return res.json({
            success: true,
            orderId
        });
    } catch (error) {
        if (req.body?.paymentMethod === 'online' || req.body?.razorpay_payment_id || req.body?.razorpay_order_id) {
            logger.error('Payment failed', {
                error: error.message,
                orderId: req.body?.razorpay_order_id || null
            });
        }

        if (error?.code === 11000 && req.body?.razorpay_payment_id) {
            const existingOrder = await Order.findOne({
                razorpayPaymentId: req.body.razorpay_payment_id
            }).select('orderId').lean();
            // concurrent retries can race; if the order now exists, return it instead of failing

            if (existingOrder) {
                delete req.session.buyNowItem;
                delete req.session.checkoutContext;
                return res.json({
                    success: true,
                    message: 'Order already processed',
                    orderId: existingOrder.orderId
                });
            }
        }

        return res.status(HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            message: error.message
        });
    }
};

const cancelOrderItem = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { orderId, itemId } = req.params;
        const { reason = '' } = req.body;
        const result = await orderService.cancelOrderItem(userId, orderId, itemId, reason);

        return res.json(result);
    } catch (error) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            message: error.message
        });
    }
};

const requestReturn = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { orderId, itemId } = req.params;
        const { reason } = req.body;
        const result = await orderService.requestReturn(userId, orderId, itemId, reason);

        return res.json(result);
    } catch (error) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            message: error.message
        });
    }
};

module.exports = {
    placeOrder,
    cancelOrderItem,
    requestReturn
};
