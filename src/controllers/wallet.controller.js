const walletService = require('../services/wallet.service');
const WalletTransaction = require('../models/wallet-transaction.model');
const Order = require('../models/order.model');

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
            type
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

const rechargeWallet = async (req, res) => {
    return res.json({ message: 'Razorpay integration pending' });
};

module.exports = {
    attachOrderIds,
    getWalletPage,
    getTransactions,
    rechargeWallet
};
