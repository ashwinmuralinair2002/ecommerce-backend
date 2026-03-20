const mongoose = require('mongoose');

const ORDER_ITEM_STATUSES = [
    'pending',
    'shipped',
    'delivered',
    'cancelled',
    'partially_cancelled',
    'return_requested',
    'return_rejected',
    'returned'
];

const ORDER_STATUSES = [
    'pending',
    'shipped',
    'delivered',
    'cancelled',
    'partially_cancelled',
    'partially_returned',
    'returned'
];

const orderItemSchema = new mongoose.Schema({
    itemId: {
        type: String,
        trim: true,
        default: null
    },
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    productName: {
        type: String,
        required: true,
        trim: true
    },
    brandName: {
        type: String,
        default: '',
        trim: true
    },
    variantId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    colorName: {
        type: String,
        default: '',
        trim: true
    },
    quantity: {
        type: Number,
        required: true,
        min: 1
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    totalPrice: {
        type: Number,
        required: true,
        min: 0
    },
    imageUrl: {
        type: String,
        default: '',
        trim: true
    },
    status: {
        type: String,
        default: 'pending',
        enum: ORDER_ITEM_STATUSES,
        trim: true
    },
    returnReason: {
        type: String,
        default: '',
        trim: true
    },
    cancellationReason: {
        type: String,
        default: '',
        trim: true
    }
}, {
    _id: false
});

const pricingSchema = new mongoose.Schema({
    totalItems: {
        type: Number,
        required: true,
        min: 0
    },
    subtotal: {
        type: Number,
        required: true,
        min: 0
    },
    gst: {
        type: Number,
        required: true,
        min: 0
    },
    finalTotal: {
        type: Number,
        required: true,
        min: 0
    }
}, {
    _id: false
});

const shippingAddressSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    phone: {
        type: String,
        required: true,
        trim: true
    },
    addressLine1: {
        type: String,
        required: true,
        trim: true
    },
    city: {
        type: String,
        required: true,
        trim: true
    },
    state: {
        type: String,
        required: true,
        trim: true
    },
    pincode: {
        type: String,
        required: true,
        trim: true
    }
}, {
    _id: false
});

const orderSchema = new mongoose.Schema({
    orderId: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    items: {
        type: [orderItemSchema],
        default: []
    },
    pricing: {
        type: pricingSchema,
        required: true
    },
    shippingAddress: {
        type: shippingAddressSchema,
        required: true
    },
    paymentMethod: {
        type: String,
        default: 'COD',
        trim: true
    },
    orderStatus: {
        type: String,
        enum: ORDER_STATUSES,
        default: 'pending',
        trim: true
    },
    totalAmount: {
        type: Number,
        required: true,
        min: 0
    },
    deleted: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Order', orderSchema);
