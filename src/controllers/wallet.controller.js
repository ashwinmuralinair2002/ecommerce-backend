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

    for (const tx of transactions) {
        if (!tx || !tx.referenceId) {
            continue;
        }

        const order = await Order.findOne({
            'items.itemId': tx.referenceId
        })
            .select('orderId')
            .lean();

        if (order && order.orderId) {
            tx.orderId = order.orderId;
        }
    }

    return transactions;
};

const getWalletPage = async (req, res, next) => {
    try {
        const userId = req.session.userId;
        const sort = req.query.sort === 'oldest' ? 'oldest' : 'newest';
        const type = req.query.type === 'credit' || req.query.type === 'debit' ? req.query.type : 'all';
        const wallet = await walletService.getWallet(userId);
        const transactions = await WalletTransaction.find(buildTransactionQuery(userId, type))
            .sort(buildSortOption(sort))
            .lean();
        await attachOrderIds(transactions);

        return res.render('user/wallet', {
            balance: Number(wallet && wallet.balance ? wallet.balance : 0),
            transactions,
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
        const transactions = await WalletTransaction.find(buildTransactionQuery(userId, type))
            .sort(buildSortOption(sort))
            .lean();
        await attachOrderIds(transactions);

        return res.json({ transactions });
    } catch (error) {
        return next(error);
    }
};

const rechargeWallet = async (req, res) => {
    return res.json({ message: 'Razorpay integration pending' });
};

module.exports = {
    getWalletPage,
    getTransactions,
    rechargeWallet
};
