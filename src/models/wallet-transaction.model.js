const mongoose = require('mongoose');

const WALLET_TRANSACTION_TYPES = ['credit', 'debit'];
const WALLET_TRANSACTION_REASONS = ['refund_cancelled', 'refund_returned', 'purchase', 'recharge', 'online recharge', 'referral_bonus'];

const walletTransactionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    type: {
        type: String,
        enum: WALLET_TRANSACTION_TYPES,
        required: true,
        trim: true
    },
    reason: {
        type: String,
        enum: WALLET_TRANSACTION_REASONS,
        required: true,
        trim: true
    },
    transactionRef: {
        type: String,
        required: true,
        trim: true
    },
    referenceId: {
        type: String,
        required: true,
        trim: true
    },
    orderId: {
        type: String,
        required: false,
        default: null,
        trim: true
    },
    razorpayPaymentId: {
        type: String,
        required: false,
        default: null,
        trim: true
    },
    razorpayOrderId: {
        type: String,
        required: false,
        default: null,
        trim: true
    },
    status: {
        type: String,
        default: 'success',
        trim: true
    }
}, {
    timestamps: true
});

walletTransactionSchema.index({ userId: 1 });
walletTransactionSchema.index({ transactionRef: 1 }, { unique: true });
walletTransactionSchema.index({ referenceId: 1 });
walletTransactionSchema.index({ orderId: 1 });
walletTransactionSchema.index({ razorpayPaymentId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);
