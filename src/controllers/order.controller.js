const { z } = require('zod');
const Order = require('../models/order.model');
const orderService = require('../services/order.service');
const { verifyRazorpaySignature } = require('../services/payment.service');

const placeOrderSchema = z.object({
    paymentMethod: z.preprocess((value) => {
        if (typeof value === 'string' && value.trim().toLowerCase() === 'cod') {
            return 'COD';
        }

        if (typeof value === 'string' && value.trim().toLowerCase() === 'online') {
            return 'online';
        }

        return value;
    }, z.enum(['COD', 'wallet', 'online']))
});

const placeOrder = async (req, res) => {
    try {
        const userId = req.session.userId;
        const {
            paymentMethod,
            razorpay_payment_id,
            razorpay_order_id,
            razorpay_signature
        } = req.body;
        const { paymentMethod: parsedPaymentMethod } = placeOrderSchema.parse({ paymentMethod });

        if (parsedPaymentMethod === 'online') {
            if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing payment verification data'
                });
            }

            const existingOrder = await Order.findOne({
                razorpayPaymentId: razorpay_payment_id
            }).select('orderId').lean();

            if (existingOrder) {
                console.warn('Duplicate online payment attempt:', razorpay_payment_id);
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
                return res.status(400).json({
                    success: false,
                    message: 'Payment verification failed'
                });
            }

            console.log('Payment verified:', razorpay_payment_id);

            req.paymentData = {
                razorpayPaymentId: razorpay_payment_id,
                razorpayOrderId: razorpay_order_id
            };
        }
        const orderId = await orderService.placeOrder(userId, parsedPaymentMethod, req.paymentData);

        return res.json({
            success: true,
            orderId
        });
    } catch (error) {
        return res.status(400).json({
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
        return res.status(400).json({
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
        return res.status(400).json({
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
