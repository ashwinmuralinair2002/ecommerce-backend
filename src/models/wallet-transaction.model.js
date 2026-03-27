const mongoose = require('mongoose');

const WALLET_TRANSACTION_TYPES = ['credit', 'debit'];
const WALLET_TRANSACTION_REASONS = ['refund_cancelled', 'refund_returned', 'purchase', 'recharge'];

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
    referenceId: {
        type: String,
        required: true,
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
walletTransactionSchema.index({ referenceId: 1 }, { unique: true });

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);
