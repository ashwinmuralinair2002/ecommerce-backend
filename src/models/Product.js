// Product schema definition and model
const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    sku: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    brand: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Brand',
        required: true
    },
    connectionType: {
        type: String,
        enum: ['Wired', 'Wireless'],
        required: true
    },
    category: {
        type: String,
        enum: ['In-ear', 'On-ear', 'Over-ear'],
        required: true
    },
    shortDescription: {
        type: String,
        trim: true,
        default: ''
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    originalPrice: {
        type: Number,
        min: 0,
        default: null
    },
    discountPercentage: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
    },
    stockCount: {
        type: Number,
        default: 0,
        min: 0
    },
    reservedCount: {
        type: Number,
        default: 0,
        min: 0
    },
    reorderThreshold: {
        type: Number,
        default: 5,
        min: 0
    },
    images: [{
        url: { type: String, required: true },
        public_id: { type: String, required: true },
        isHero: { type: Boolean, default: false }
    }],
    status: {
        type: String,
        enum: ['Active', 'Inactive'],
        default: 'Active'
    },
    isListed: {
        type: Boolean,
        default: true
    },
    // Wired specs
    cableLength: { type: String, default: '' },
    connectorType: { type: String, default: '' },
    impedance: { type: String, default: '' },
    driverSize: { type: String, default: '' },
    // Wireless specs
    bluetoothVersion: { type: String, default: '' },
    batteryLife: { type: String, default: '' },
    chargingTime: { type: String, default: '' },
    wirelessRange: { type: String, default: '' },
    noiseCancellation: { type: String, default: '' },
    // Shipping
    length: { type: Number, default: null },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    weight: { type: Number, default: null },
    // SEO
    metaTitle: { type: String, default: '' },
    metaDescription: { type: String, default: '' },
    // Badges
    badges: [{
        type: String,
        enum: ['Best seller', 'New', 'Deal']
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('Product', productSchema);
