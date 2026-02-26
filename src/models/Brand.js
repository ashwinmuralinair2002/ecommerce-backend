// Brand schema definition and model
const mongoose = require('mongoose');

const brandSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    logoUrl: {
        type: String,
        default: ''
    },
    logoCrop: {
        x: { type: Number, default: null },
        y: { type: Number, default: null },
        width: { type: Number, default: null },
        height: { type: Number, default: null }
    },
    description: {
        type: String,
        trim: true
    },
    website: {
        type: String,
        default: ''
    },
    contactEmail: {
        type: String,
        default: ''
    },
    isActive: {
        type: Boolean,
        default: true
    },
    productCount: {
        type: Number,
        default: 0
    },
    isDeleted: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Brand', brandSchema);
