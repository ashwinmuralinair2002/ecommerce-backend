const walletService = require('../services/wallet.service');
const WalletTransaction = require('../models/wallet-transaction.model');
const Order = require('../models/order.model');
const AppError = require('../utils/AppError');
const HTTP_STATUS = require('../constants/http-status');
const MESSAGES = require('../constants/messages');

const MIN_RECHARGE_AMOUNT = 10;
const MAX_RECHARGE_AMOUNT = 50000;

const parseRechargeAmount = (value) => {
    const amount = typeof value === 'string' ? Number(value.trim()) : Number(value);

    if (!Number.isFinite(amount)) {
        throw new AppError('Invalid recharge amount', 400);
    }

    const normalizedAmount = Math.round((amount + Number.EPSILON) * 100) / 100;

    if (normalizedAmount < MIN_RECHARGE_AMOUNT || normalizedAmount > MAX_RECHARGE_AMOUNT) {
        throw new AppError(`Recharge amount must be between Rs ${MIN_RECHARGE_AMOUNT} and Rs ${MAX_RECHARGE_AMOUNT}`, 400);
    }

    return normalizedAmount;
};

const buildTransactionQuery = (userId, type) => {
    const query = { userId };

    if (type === 'credit' || type === 'debit') {
        query.type = type;
    }

    return query;
};

const buildSortOption = (sort) => (sort === 'oldest' ? { createdAt: 1 } : { createdAt: -1 });

const attachOrderIds = async (transactions) => {
    if (!Array.isArray(transactions) || transactions.length === 0) {
        return transactions;
    }

    const pendingReferenceIds = [
        ...new Set(
            transactions
                .filter((tx) => tx && !tx.orderId && tx.referenceId)
                .map((tx) => tx.referenceId)
        )
    ];

    if (pendingReferenceIds.length === 0) {
        return transactions;
    }

    const orders = await Order.find({
        'items.itemId': { $in: pendingReferenceIds }
    })
        .select('orderId items.itemId')
        .lean();

    const orderIdByItemId = new Map();

    for (const order of orders) {
        const orderPublicId = order && order.orderId ? order.orderId : null;
        const items = order && Array.isArray(order.items) ? order.items : [];

        if (!orderPublicId) {
            continue;
        }

        for (const item of items) {
            if (!item || !item.itemId) {
                continue;
            }

            if (pendingReferenceIds.includes(item.itemId) && !orderIdByItemId.has(item.itemId)) {
                orderIdByItemId.set(item.itemId, orderPublicId);
            }
        }
    }

    for (const tx of transactions) {
        if (!tx || tx.orderId || !tx.referenceId) {
            continue;
        }

        const derivedOrderId = orderIdByItemId.get(tx.referenceId);

        if (derivedOrderId) {
            tx.orderId = derivedOrderId;
        }
    }

    return transactions;
};

const getWalletPage = async (req, res, next) => {
    try {
        const userId = req.session.userId;
        const sort = req.query.sort === 'oldest' ? 'oldest' : 'newest';
        const type = req.query.type === 'credit' || req.query.type === 'debit' ? req.query.type : 'all';
        const limit = 10;
        const currentPage = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const query = buildTransactionQuery(userId, type);
        const wallet = await walletService.getWallet(userId);
        const totalTransactions = await WalletTransaction.countDocuments(query);
        const totalPages = Math.max(Math.ceil(totalTransactions / limit), 1);
        const safePage = Math.min(currentPage, totalPages);
        const skip = (safePage - 1) * limit;
        const transactions = await WalletTransaction.find(query)
            .sort(buildSortOption(sort))
            .skip(skip)
            .limit(limit)
            .lean();
        await attachOrderIds(transactions);

        return res.render('user/wallet', {
            balance: Number(wallet && wallet.balance ? wallet.balance : 0),
            transactions,
            currentPage: safePage,
            totalPages,
            sort,
            type,
            razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
            RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || ''
        });
    } catch (error) {
        return next(error);
    }
};

const getTransactions = async (req, res, next) => {
    try {
        const userId = req.session.userId;
        const sort = req.query.sort === 'oldest' ? 'oldest' : 'newest';
        const type = req.query.type === 'credit' || req.query.type === 'debit' ? req.query.type : 'all';
        const parsedLimit = parseInt(req.query.limit, 10) || 10;
        const limit = Math.min(Math.max(parsedLimit, 1), 10);
        const currentPage = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const query = buildTransactionQuery(userId, type);
        const totalTransactions = await WalletTransaction.countDocuments(query);
        const totalPages = Math.max(Math.ceil(totalTransactions / limit), 1);
        const safePage = Math.min(currentPage, totalPages);
        const skip = (safePage - 1) * limit;
        const transactions = await WalletTransaction.find(query)
            .sort(buildSortOption(sort))
            .skip(skip)
            .limit(limit)
            .lean();
        await attachOrderIds(transactions);

        return res.json({
            transactions,
            totalPages,
            currentPage: safePage
        });
    } catch (error) {
        return next(error);
    }
};

const createRechargeOrder = async (req, res) => {
    try {
        const { getRazorpayInstance } = require('../services/payment.service');
        const userId = req.session && req.session.userId;

        if (!userId) {
            return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                message: MESSAGES.AUTH_REQUIRED
            });
        }

        if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
            throw new AppError('Razorpay is not configured', 500);
        }

        const amount = parseRechargeAmount(req.body && req.body.amount);
        const amountInPaise = Math.round(amount * 100);
        const receipt = `wallet_${String(userId).slice(-6)}_${Date.now()}`.slice(0, 40);
        const razorpayInstance = getRazorpayInstance();
        const razorpayOrder = await razorpayInstance.orders.create({
            amount: amountInPaise,
            currency: 'INR',
            receipt,
            payment_capture: 1,
            notes: {
                userId: String(userId),
                purpose: 'wallet_recharge'
            }
        });

        return res.json({
            success: true,
            data: {
                razorpayOrderId: razorpayOrder.id,
                amount: razorpayOrder.amount,
                currency: razorpayOrder.currency
            }
        });
    } catch (error) {
        return res.status(error.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: error.message || 'Failed to create recharge order'
        });
    }
};

const verifyRecharge = async (req, res) => {
    try {
        const { getRazorpayInstance, verifyRazorpaySignature } = require('../services/payment.service');
        const userId = req.session && req.session.userId;

        if (!userId) {
            return res.status(HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                message: MESSAGES.AUTH_REQUIRED
            });
        }

        const {
            razorpay_payment_id: razorpayPaymentId,
            razorpay_order_id: razorpayOrderId,
            razorpay_signature: razorpaySignature
        } = req.body || {};

        if (!razorpayPaymentId || !razorpayOrderId || !razorpaySignature) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: 'Missing payment verification data'
            });
        }

        const isValid = verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);

        if (!isValid) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: MESSAGES.PAYMENT_VERIFICATION_FAILED
            });
        }

        const existingTransaction = await WalletTransaction.findOne({
            razorpayPaymentId
        }).select('userId').lean();

        if (existingTransaction) {
            if (String(existingTransaction.userId) !== String(userId)) {
                throw new AppError('Payment already linked to another wallet', 400);
            }

            return res.json({ success: true });
        }

        const razorpayInstance = getRazorpayInstance();
        const order = await razorpayInstance.orders.fetch(razorpayOrderId);

        if (!order || !order.notes || String(order.notes.userId || '') !== String(userId)) {
            throw new AppError('Recharge order does not belong to this user', 400);
        }

        const payment = await razorpayInstance.payments.fetch(razorpayPaymentId);

        if (!payment || payment.status !== 'captured') {
            throw new AppError('Payment is not captured', 400);
        }

        if (payment.order_id !== razorpayOrderId) {
            throw new AppError(MESSAGES.PAYMENT_ORDER_MISMATCH, 400);
        }

        const amountInRupees = Number(payment.amount || 0) / 100;

        await walletService.creditWallet(
            userId,
            amountInRupees,
            'online recharge',
            razorpayPaymentId,
            null,
            {
                razorpayPaymentId,
                razorpayOrderId
            }
        );

        return res.json({ success: true });
    } catch (error) {
        return res.status(error.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: error.message || 'Failed to verify recharge payment'
        });
    }
};

const rechargeWallet = async (req, res) => {
    return createRechargeOrder(req, res);
};

module.exports = {
    attachOrderIds,
    getWalletPage,
    getTransactions,
    rechargeWallet,
    createRechargeOrder,
    verifyRecharge
};
