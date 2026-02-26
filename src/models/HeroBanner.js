const mongoose = require('mongoose');

const heroBannerSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['product', 'category', 'brand', 'custom'],
        required: true
    },
    refId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null
    },
    headline: {
        type: String,
        default: ''
    },
    subHeadline: {
        type: String,
        default: ''
    },
    ctaText: {
        type: String,
        default: 'Shop Now'
    },
    ctaLink: {
        type: String,
        default: ''
    },
    image: {
        url: {
            type: String,
            required: true
        },
        public_id: {
            type: String,
            required: true
        }
    },
    order: {
        type: Number,
        default: 0
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

heroBannerSchema.index({ isActive: 1 });
heroBannerSchema.index({ order: 1 });

module.exports = mongoose.model('HeroBanner', heroBannerSchema);
