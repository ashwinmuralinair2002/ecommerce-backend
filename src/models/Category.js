// Category schema definition and model
const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    slug: {
        type: String,
        unique: true,
        trim: true
    },
    description: {
        type: String,
        default: ''
    },
    image: {
        url: { type: String, default: '' },
        public_id: { type: String, default: '' }
    },
    heroImage: {
        url: { type: String, default: '' },
        public_id: { type: String, default: '' }
    },
    isBlocked: {
        type: Boolean,
        default: false
    },
    isDeleted: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Category', categorySchema);
