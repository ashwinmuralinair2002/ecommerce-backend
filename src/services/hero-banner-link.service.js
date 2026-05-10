const mongoose = require('mongoose');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Brand = require('../models/Brand');

const HERO_REDIRECT_FALLBACK_PATH = '/';

async function resolveProductRedirectPath(refId) {
    if (!mongoose.Types.ObjectId.isValid(String(refId || ''))) {
        return HERO_REDIRECT_FALLBACK_PATH;
    }

    const product = await Product.findById(refId)
        .select('_id isListed isDeleted category')
        .populate('category', '_id isBlocked isDeleted')
        .lean();

    const category = product && product.category;
    const isCategoryAvailable = Boolean(
        category
        && category._id
        && category.isBlocked !== true
        && category.isDeleted !== true
    );

    if (!product || product.isDeleted === true || product.isListed === false || !isCategoryAvailable) {
        return HERO_REDIRECT_FALLBACK_PATH;
    }

    return `/product/${product._id}`;
}

async function resolveCategoryRedirectPath(refId) {
    if (!mongoose.Types.ObjectId.isValid(String(refId || ''))) {
        return HERO_REDIRECT_FALLBACK_PATH;
    }

    const category = await Category.findOne({
        _id: refId,
        isBlocked: { $ne: true },
        isDeleted: { $ne: true }
    }).select('_id').lean();

    return category ? `/category/${category._id}` : HERO_REDIRECT_FALLBACK_PATH;
}

async function resolveBrandRedirectPath(refId) {
    if (!mongoose.Types.ObjectId.isValid(String(refId || ''))) {
        return HERO_REDIRECT_FALLBACK_PATH;
    }

    const brand = await Brand.findOne({
        _id: refId,
        isActive: true,
        isDeleted: { $ne: true }
    }).select('_id').lean();

    return brand ? `/brand/${brand._id}` : HERO_REDIRECT_FALLBACK_PATH;
}

async function resolveHeroBannerRedirectPath(banner) {
    const type = String(banner?.type || '').trim().toLowerCase();

    if (!banner || banner.isActive === false) {
        return HERO_REDIRECT_FALLBACK_PATH;
    }

    if (type === 'product') {
        return resolveProductRedirectPath(banner.refId);
    }

    if (type === 'category') {
        return resolveCategoryRedirectPath(banner.refId);
    }

    if (type === 'brand') {
        return resolveBrandRedirectPath(banner.refId);
    }

    return HERO_REDIRECT_FALLBACK_PATH;
}

module.exports = {
    HERO_REDIRECT_FALLBACK_PATH,
    resolveHeroBannerRedirectPath
};
