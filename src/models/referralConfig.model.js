const mongoose = require('mongoose');

const referralConfigSchema = new mongoose.Schema({
    referrerReward: {
        type: Number,
        required: true,
        default: 200
    },
    referredUserReward: {
        type: Number,
        required: true,
        default: 200
    },
    maxReferrals: {
        type: Number,
        required: true,
        default: 3
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

module.exports = mongoose.model('ReferralConfig', referralConfigSchema);
