const mongoose = require('mongoose');

const { Schema } = mongoose;

const couponSchema = new Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true
    },
    discountType: {
        type: String,
        enum: ['FLAT', 'PERCENTAGE'],
        required: true
    },
    discountValue: {
        type: Number,
        required: true,
        min: 0.01
    },
    minOrderValue: {
        type: Number,
        default: 0,
        min: 0
    },
    maxDiscount: {
        type: Number,
        default: null,
        min: 0.01
    },
    usageLimit: {
        type: Number,
        default: null,
        min: 1
    },
    usagePerUser: {
        type: Number,
        default: null,
        min: 1
    },
    usedCount: {
        type: Number,
        default: 0,
        min: 0
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isDeleted: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

couponSchema.pre('save', async function normalizeCouponCode() {
    if (typeof this.code === 'string') {
        this.code = this.code.trim().toUpperCase();
    }
});

couponSchema.index({ code: 1 });
couponSchema.index({ isActive: 1, isDeleted: 1 });
couponSchema.index({ createdAt: -1 });
couponSchema.index({ startDate: 1, endDate: 1 });

module.exports = mongoose.model('Coupon', couponSchema);
