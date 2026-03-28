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
    maxDiscount: {
        type: Number,
        default: null,
        min: 0.01
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

offerSchema.index({ type: 1 });
offerSchema.index({ isActive: 1 });
offerSchema.index({ startDate: 1, endDate: 1 });

module.exports = mongoose.model('Offer', offerSchema);
