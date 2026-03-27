const mongoose = require('mongoose');
const { z } = require('zod');
const Wallet = require('../models/wallet.model');
const WalletTransaction = require('../models/wallet-transaction.model');
const AppError = require('../utils/AppError');

const roundCurrency = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const generateWalletReferenceId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const amountSchema = z.number().positive().finite();

const normalizeAmount = (amount) => roundCurrency(Number(amount));

const validateAmount = (amount) => {
    try {
        const normalizedAmount = normalizeAmount(amount);
        return amountSchema.parse(normalizedAmount);
    } catch (error) {
        throw new AppError('Invalid wallet amount', 400);
    }
};

const normalizeReferenceId = (referenceId) => {
    if (!referenceId || typeof referenceId !== 'string') {
        throw new AppError('Invalid referenceId', 400);
    }

    const normalizedReferenceId = referenceId.trim();

    if (!normalizedReferenceId) {
        throw new AppError('Invalid wallet reference', 400);
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

const creditWallet = async (userId, amount, reason, referenceId) => {
    const normalizedAmount = validateAmount(amount);
    const normalizedReferenceId = normalizeReferenceId(referenceId);
    const session = await mongoose.startSession();

    try {
        let result = null;

        await session.withTransaction(async () => {
            const existingTransaction = await WalletTransaction.findOne({
                referenceId: normalizedReferenceId
            }).session(session);

            if (existingTransaction) {
                const wallet = await createWallet(userId, session);

                result = {
                    wallet,
                    transaction: existingTransaction,
                    duplicated: true
                };

                return;
            }

            const wallet = await createWallet(userId, session);
            const updatedWallet = await Wallet.findOneAndUpdate(
                { _id: wallet._id },
                { $inc: { balance: normalizedAmount } },
                { new: true, session }
            );

            const transaction = await WalletTransaction.create([{
                userId,
                amount: normalizedAmount,
                type: 'credit',
                reason,
                referenceId: normalizedReferenceId,
                status: 'success'
            }], { session });

            result = {
                wallet: updatedWallet,
                transaction: transaction[0],
                duplicated: false
            };
        });

        return result;
    } catch (error) {
        if (error instanceof AppError) {
            throw error;
        }

        if (error && error.code === 11000) {
            const existingTransaction = await WalletTransaction.findOne({
                referenceId: normalizedReferenceId
            });
            const wallet = await createWallet(userId);

            return {
                wallet,
                transaction: existingTransaction,
                duplicated: true
            };
        }

        throw new AppError('Wallet service failed', 500);
    } finally {
        await session.endSession();
    }
};

const debitWallet = async (userId, amount, reason, referenceId, session = null) => {
    const normalizedAmount = validateAmount(amount);
    const normalizedReferenceId = referenceId
        ? normalizeReferenceId(referenceId)
        : normalizeReferenceId(generateWalletReferenceId('WALLET-DEBIT'));
    const ownsSession = !session;
    const activeSession = session || await mongoose.startSession();

    try {
        if (ownsSession) {
            activeSession.startTransaction();
        }

        const existingTransaction = await WalletTransaction.findOne({
            referenceId: normalizedReferenceId
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

        const wallet = await createWallet(userId, activeSession);
        const updatedWallet = await Wallet.findOneAndUpdate(
            {
                _id: wallet._id,
                balance: { $gte: normalizedAmount }
            },
            { $inc: { balance: -normalizedAmount } },
            { new: true, session: activeSession }
        );

        if (!updatedWallet) {
            throw new AppError('Insufficient wallet balance', 400);
        }

        const transaction = await WalletTransaction.create([{
            userId,
            amount: normalizedAmount,
            type: 'debit',
            reason,
            referenceId: normalizedReferenceId,
            status: 'success'
        }], { session: activeSession });

        if (ownsSession) {
            await activeSession.commitTransaction();
        }

        return {
            wallet: updatedWallet,
            transaction: transaction[0],
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
            const existingTransaction = await WalletTransaction.findOne({
                referenceId: normalizedReferenceId
            });
            const wallet = await createWallet(userId);

            if (ownsSession && activeSession.inTransaction()) {
                await activeSession.abortTransaction();
            }

            return {
                wallet,
                transaction: existingTransaction,
                duplicated: true
            };
        }

        if (ownsSession && activeSession.inTransaction()) {
            await activeSession.abortTransaction();
        }

        throw new AppError('Wallet service failed', 500);
    } finally {
        if (ownsSession) {
            await activeSession.endSession();
        }
    }
};

module.exports = {
    createWallet,
    getWallet,
    creditWallet,
    debitWallet
};
