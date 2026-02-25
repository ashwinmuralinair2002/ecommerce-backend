// Product schema definition and model
const mongoose = require('mongoose');

const NOISE_CANCELLATION_TYPES = [
    'Active Noise Cancellation',
    'Passive Noise Cancellation',
    'Feedforward ANC',
    'Feedback ANC',
    'Hybrid ANC',
    'Adaptive Noise Cancellation',
    'Environmental Noise Cancellation',
    'None',
    // Backward compatibility for already-migrated products
    'Passive Noise Isolation'
];
const CONTROL_METHODS = ['Touch', 'Button', 'Voice', 'App'];
const CABLE_FEATURES = ['Detachable Cable', 'Braided Cable', 'Tangle Free', 'Inline Remote'];
const SMART_FEATURES = ['Voice Assistant', 'Multipoint', 'Companion App', 'Adaptive Audio'];
const COMPATIBLE_DEVICES = ['Android', 'iOS', 'Windows', 'Mac', 'PlayStation', 'Xbox'];
const MATERIALS = ['Plastic', 'Aluminium', 'Steel', 'Leather', 'Fabric', 'Silicone'];
const INCLUDED_COMPONENTS = ['Carrying Case', 'Charging Cable', 'Audio Cable', 'Ear Tips', 'User Manual'];
const AUDIO_DRIVER_TYPES = ['Dynamic', 'Planar Magnetic', 'Balanced Armature', 'Hybrid'];
const FORM_FACTORS = [
    'In-Ear',
    'In-Ear (Earbuds/IEMs)',
    'Over-Ear',
    'On-Ear',
    'Clip-On',
    'Ear Hooks',
    'True Wireless (TWS)',
    'Neckband',
    'Bone Conduction'
];
const EARPIECE_SHAPES = ['Round', 'Oval', 'Ergonomic'];
const IMPEDANCE_RANGES = ['Up to 32 Ohm', '33-80 Ohm', '81-250 Ohm', '250+ Ohm'];
const SENSITIVITY_RANGES = ['Up to 95 dB', '96-105 dB', '106-115 dB', '115+ dB'];

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
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
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
    variants: [{
        colorName: {
            type: String,
            default: ''
        },
        colorCode: {
            type: String,
            required: true,
            trim: true
        },
        images: [{
            url: { type: String, required: true },
            public_id: { type: String, required: true }
        }]
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
    isDeleted: {
        type: Boolean,
        default: false
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
    }],
    warranty: {
        duration: {
            type: String,
            enum: ['No Warranty', '6 Months', '1 Year', '2 Years', '3 Years'],
            default: 'No Warranty'
        },
        provider: {
            type: String,
            enum: ['Brand', 'SoundWave'],
            default: 'Brand'
        }
    },
    noiseControlTypes: [{
        type: String,
        enum: NOISE_CANCELLATION_TYPES
    }],
    ambientModeAvailable: {
        type: Boolean,
        default: false
    },
    controlMethods: [{
        type: String,
        enum: CONTROL_METHODS
    }],
    cableFeatures: [{
        type: String,
        enum: CABLE_FEATURES
    }],
    smartFeatures: [{
        type: String,
        enum: SMART_FEATURES
    }],
    compatibleDevices: [{
        type: String,
        enum: COMPATIBLE_DEVICES
    }],
    materials: [{
        type: String,
        enum: MATERIALS
    }],
    includedComponents: [{
        type: String,
        enum: INCLUDED_COMPONENTS
    }],
    audioDriverTypes: [{
        type: String,
        enum: AUDIO_DRIVER_TYPES
    }],
    formFactor: {
        type: String,
        enum: FORM_FACTORS,
        default: null
    },
    earpieceShape: {
        type: String,
        enum: EARPIECE_SHAPES,
        default: null
    },
    impedanceRange: {
        type: String,
        enum: IMPEDANCE_RANGES,
        default: null
    },
    sensitivityRange: {
        type: String,
        enum: SENSITIVITY_RANGES,
        default: null
    },
    hasMicrophone: {
        type: Boolean,
        default: false
    },
    batteryChargingTime: {
        type: Number,
        default: null
    }
}, {
    timestamps: true
});

productSchema.index({ formFactor: 1 });
productSchema.index({ hasMicrophone: 1 });
productSchema.index({ noiseControlTypes: 1 });
productSchema.index({ materials: 1 });
productSchema.index({ audioDriverTypes: 1 });
productSchema.index({ createdAt: -1 });
productSchema.index(
    { title: 'text', shortDescription: 'text' },
    { weights: { title: 5, shortDescription: 2 } }
);

module.exports = mongoose.model('Product', productSchema);
