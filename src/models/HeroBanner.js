const mongoose = require('mongoose');

const HERO_BANNER_PLACEMENTS = ['home', 'brand', 'category'];

function getDefaultPlacementsForType(type) {
    if (type === 'product') return ['home'];
    if (HERO_BANNER_PLACEMENTS.includes(type)) return [type];
    return [];
}

const heroBannerSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['product', 'category', 'brand', 'custom'],
        required: true
    },
    placements: [{
        type: String,
        enum: HERO_BANNER_PLACEMENTS
    }],
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
    mobileImage: {
        url: {
            type: String,
            default: null
        },
        public_id: {
            type: String,
            default: null
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

heroBannerSchema.pre('validate', function sanitizeHeroPlacements() {
    const rawPlacements = Array.isArray(this.placements)
        ? this.placements.map((placement) => String(placement || '').trim().toLowerCase()).filter(Boolean)
        : [];
    const validPlacements = [...new Set(rawPlacements)].filter((placement) => HERO_BANNER_PLACEMENTS.includes(placement));

    this.placements = validPlacements.length > 0
        ? validPlacements
        : getDefaultPlacementsForType(String(this.type || '').trim().toLowerCase());
});

heroBannerSchema.index({ isActive: 1 });
heroBannerSchema.index({ order: 1 });

module.exports = mongoose.model('HeroBanner', heroBannerSchema);
