const mongoose = require('mongoose');
const { z } = require('zod');
const Wallet = require('../models/wallet.model');
const WalletTransaction = require('../models/wallet-transaction.model');
const AppError = require('../utils/AppError');
const HTTP_STATUS = require('../constants/http-status');

const roundCurrency = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const generateWalletReferenceId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const amountSchema = z.number().positive().finite();

const normalizeAmount = (amount) => roundCurrency(Number(amount));

const validateAmount = (amount) => {
    try {
        const normalizedAmount = normalizeAmount(amount);
        return amountSchema.parse(normalizedAmount);
    } catch (error) {
        throw new AppError('Invalid wallet amount', HTTP_STATUS.BAD_REQUEST);
    }
};

const normalizeReferenceId = (referenceId) => {
    if (!referenceId || typeof referenceId !== 'string') {
        throw new AppError('Invalid referenceId', HTTP_STATUS.BAD_REQUEST);
    }

    const normalizedReferenceId = referenceId.trim();

    if (!normalizedReferenceId) {
        throw new AppError('Invalid wallet reference', HTTP_STATUS.BAD_REQUEST);
    }

    return normalizedReferenceId;
};

const createWallet = async (userId, session = null) => {
    const options = {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
    };

    if (session) {
        options.session = session;
    }

    return Wallet.findOneAndUpdate(
        { userId },
        { $setOnInsert: { userId, balance: 0 } },
        options
    );
};

const getWallet = async (userId, session = null) => {
    return createWallet(userId, session);
};

const creditWallet = async (userId, amount, reason, transactionRef, orderId = null, options = {}) => {
    const normalizedAmount = validateAmount(amount);
    const normalizedTransactionRef = normalizeReferenceId(transactionRef);
    const normalizedReferenceId = normalizedTransactionRef;
    const normalizedOrderId = typeof orderId === 'string' && orderId.trim() ? orderId.trim() : null;
    const normalizedOptions = options && typeof options === 'object' ? options : {};
    const activeSessionFromOptions = normalizedOptions.session || null;
    const normalizedRazorpayPaymentId = typeof normalizedOptions.razorpayPaymentId === 'string' && normalizedOptions.razorpayPaymentId.trim()
        ? normalizedOptions.razorpayPaymentId.trim()
        : null;
    const normalizedRazorpayOrderId = typeof normalizedOptions.razorpayOrderId === 'string' && normalizedOptions.razorpayOrderId.trim()
        ? normalizedOptions.razorpayOrderId.trim()
        : null;
    const ownsSession = !activeSessionFromOptions;
    const activeSession = activeSessionFromOptions || await mongoose.startSession();

    try {
        console.log('WALLET CREDIT:', {
            userId,
            amount: normalizedAmount,
            transactionRef: normalizedTransactionRef,
            orderId: normalizedOrderId
        });

        if (ownsSession) {
            activeSession.startTransaction();
        }

        const existingTransaction = await WalletTransaction.findOne({
            transactionRef: normalizedTransactionRef
        }).session(activeSession);

        if (existingTransaction) {
            const wallet = await createWallet(userId, activeSession);

            if (ownsSession) {
                await activeSession.commitTransaction();
            }

            return {
                wallet,
                transaction: existingTransaction,
                duplicated: true
            };
        }

        await createWallet(userId, activeSession);

        let transaction = null;

        try {
            const createdTransactions = await WalletTransaction.create([{
                userId,
                amount: normalizedAmount,
                type: 'credit',
                reason,
                transactionRef: normalizedTransactionRef,
                referenceId: normalizedReferenceId,
                orderId: normalizedOrderId,
                razorpayPaymentId: normalizedRazorpayPaymentId,
                razorpayOrderId: normalizedRazorpayOrderId,
                status: 'success'
            }], { session: activeSession });

            transaction = createdTransactions[0];
        } catch (error) {
            if (error && error.code === 11000) {
                throw error;
            }

            throw error;
        }

        await Wallet.updateOne(
            { userId },
            { $inc: { balance: normalizedAmount } },
            { session: activeSession, upsert: true, setDefaultsOnInsert: true }
        );

        const wallet = await createWallet(userId, activeSession);

        if (ownsSession) {
            await activeSession.commitTransaction();
        }

        return {
            wallet,
            transaction,
            duplicated: false
        };
    } catch (error) {
        if (error instanceof AppError) {
            if (ownsSession && activeSession.inTransaction()) {
                await activeSession.abortTransaction();
            }
            throw error;
        }

        if (error && error.code === 11000) {
            if (ownsSession && activeSession.inTransaction()) {
                await activeSession.abortTransaction();
            }

            const existingTransaction = await WalletTransaction.findOne({
                transactionRef: normalizedTransactionRef
            });
            if (existingTransaction) {
                const wallet = await createWallet(userId);

                return {
                    wallet,
                    transaction: existingTransaction,
                    duplicated: true
                };
            }
        }

        if (ownsSession && activeSession.inTransaction()) {
            await activeSession.abortTransaction();
        }

        throw new AppError('Wallet service failed', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    } finally {
        if (ownsSession) {
            await activeSession.endSession();
        }
    }
};

const debitWallet = async (userId, amount, reason, transactionRef, orderId = null, session = null) => {
    const normalizedAmount = validateAmount(amount);
    const normalizedTransactionRef = transactionRef
        ? normalizeReferenceId(transactionRef)
        : normalizeReferenceId(generateWalletReferenceId('WALLET-DEBIT'));
    const normalizedOrderId = typeof orderId === 'string' && orderId.trim() ? orderId.trim() : null;

    if (!session) {
        throw new Error('Session is required for wallet debit');
    }

    const activeSession = session;

    try {
        const existingTransaction = await WalletTransaction.findOne({
            transactionRef: normalizedTransactionRef
        }).session(activeSession);

        if (existingTransaction) {
            const wallet = await createWallet(userId, activeSession);

            return {
                wallet,
                transaction: existingTransaction,
                duplicated: true
            };
        }

        const wallet = await createWallet(userId, activeSession);

        if (!wallet || Number(wallet.balance || 0) < normalizedAmount) {
            throw new AppError('Insufficient wallet balance', HTTP_STATUS.BAD_REQUEST);
        }

        const transaction = await WalletTransaction.create([{
            userId,
            amount: normalizedAmount,
            type: 'debit',
            reason,
            transactionRef: normalizedTransactionRef,
            referenceId: normalizedTransactionRef,
            orderId: normalizedOrderId,
            status: 'success'
        }], { session: activeSession });

        const updatedWallet = await Wallet.findOneAndUpdate(
            {
                _id: wallet._id,
                balance: { $gte: normalizedAmount }
            },
            { $inc: { balance: -normalizedAmount } },
            { new: true, session: activeSession }
        );

        if (!updatedWallet) {
            throw new AppError('Insufficient wallet balance', HTTP_STATUS.BAD_REQUEST);
        }

        return {
            wallet: updatedWallet,
            transaction: transaction[0],
            duplicated: false
        };
    } catch (error) {
        if (error instanceof AppError) {
            throw error;
        }

        if (error && error.code === 11000) {
            const existingTransaction = await WalletTransaction.findOne({
                transactionRef: normalizedTransactionRef
            }).session(activeSession);
            const wallet = await createWallet(userId, activeSession);

            return {
                wallet,
                transaction: existingTransaction,
                duplicated: true
            };
        }

        throw new AppError('Wallet service failed', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
};

module.exports = {
    createWallet,
    getWallet,
    creditWallet,
    debitWallet
};
