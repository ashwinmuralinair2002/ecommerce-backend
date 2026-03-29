const mongoose = require('mongoose');

const { Schema } = mongoose;

const offerSchema = new Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    type: {
        type: String,
        enum: ['PRODUCT', 'CATEGORY', 'BRAND'],
        required: true
    },
    discountType: {
        type: String,
        enum: ['PERCENTAGE', 'FLAT'],
        required: true
    },
    discountValue: {
        type: Number,
        required: true,
        min: 0.01
    },
    applicableProducts: {
        type: [Schema.Types.ObjectId],
        ref: 'Product',
        default: []
    },
    applicableCategories: {
        type: [Schema.Types.ObjectId],
        ref: 'Category',
        default: []
    },
    applicableBrands: {
        type: [Schema.Types.ObjectId],
        ref: 'Brand',
        default: []
    },
    minOrderValue: {
        type: Number,
        default: 0,
        min: 0
    },
    maxDiscountAmount: {
        type: Number,
        default: null,
        min: 0
    },
    maxDiscount: {
        type: Number,
        default: null,
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

offerSchema.pre('validate', function alignOfferGuardrails() {
    const discountType = String(this.discountType || '').toUpperCase();

    if (discountType === 'FLAT') {
        this.maxDiscountAmount = null;
        this.maxDiscount = null;
    } else if (discountType === 'PERCENTAGE') {
        if (this.maxDiscountAmount == null && this.maxDiscount != null) {
            this.maxDiscountAmount = this.maxDiscount;
        }

        if (this.maxDiscount == null && this.maxDiscountAmount != null) {
            this.maxDiscount = this.maxDiscountAmount;
        }
    }
});

offerSchema.path('maxDiscountAmount').validate(function validatePercentageMaxDiscount(value) {
    const discountType = String(this.discountType || '').toUpperCase();

    if (discountType === 'PERCENTAGE') {
        return Number.isFinite(Number(value)) && Number(value) > 0;
    }

    return value == null;
}, 'Max discount amount is required for percentage offers and must be empty for flat offers.');

offerSchema.index({ type: 1 });
offerSchema.index({ isActive: 1 });
offerSchema.index({ startDate: 1, endDate: 1 });

module.exports = mongoose.model('Offer', offerSchema);
