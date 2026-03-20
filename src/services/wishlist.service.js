const mongoose = require('mongoose');
const Wishlist = require('../models/wishlist.model');
const Product = require('../models/Product');
const cartService = require('./cart.service');

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const ensureValidIds = (productId, variantId) => {
    if (!isValidObjectId(productId) || !isValidObjectId(variantId)) {
        throw new Error('Invalid product or variant');
    }
};

const getValidatedProductAndVariant = async (productId, variantId) => {
    ensureValidIds(productId, variantId);

    const product = await Product.findById(productId).select('title price images variants');

    if (!product) {
        throw new Error('Product not found');
    }

    const variant = product.variants.id(variantId);

    if (!variant) {
        throw new Error('Variant not found');
    }

    return { product, variant };
};

const isMatchingItem = (item, productId, variantId) => (
    item.productId.equals(productId)
    && item.variantId.equals(variantId)
);

const formatWishlistItem = (item) => {
    const product = item.productId;
    let images = [];

    if (product) {
        if (Array.isArray(product.images) && product.images.length) {
            images = product.images;
        } else if (
            Array.isArray(product.variants) &&
            product.variants.length &&
            Array.isArray(product.variants[0].images) &&
            product.variants[0].images.length
        ) {
            images = product.variants[0].images;
        }
    }

    return {
        product: product ? {
            _id: product._id,
            name: product.title,
            price: product.price,
            images
        } : null,
        productId: product ? product._id : item.productId,
        variantId: item.variantId,
        addedAt: item.addedAt
    };
};

const buildWishlistResponse = async (userId) => {
    const wishlist = await Wishlist.findOne({ user: userId })
        .populate({
            path: 'items.productId',
            select: 'title price images variants'
        })
        .lean();

    if (!wishlist) {
        return { items: [] };
    }

    return {
        _id: wishlist._id,
        user: wishlist.user,
        items: wishlist.items.map(formatWishlistItem),
        createdAt: wishlist.createdAt,
        updatedAt: wishlist.updatedAt
    };
};

const getWishlist = async (userId) => buildWishlistResponse(userId);

const addToWishlist = async (userId, productId, variantId) => {
    await getValidatedProductAndVariant(productId, variantId);

    let wishlist = await Wishlist.findOne({ user: userId });

    if (!wishlist) {
        wishlist = new Wishlist({
            user: userId,
            items: []
        });
    }

    const alreadyExists = wishlist.items.some((item) => isMatchingItem(item, productId, variantId));

    if (!alreadyExists) {
        wishlist.items.push({
            productId,
            variantId
        });

        await wishlist.save();
    }

    return {
        success: true,
        message: 'Added to wishlist'
    };
};

const removeFromWishlist = async (userId, productId, variantId) => {
    ensureValidIds(productId, variantId);

    const wishlist = await Wishlist.findOne({ user: userId });

    if (!wishlist) {
        return {
            success: true,
            message: 'Wishlist updated'
        };
    }

    wishlist.items = wishlist.items.filter((item) => !isMatchingItem(item, productId, variantId));
    await wishlist.save();

    return {
        success: true,
        message: 'Wishlist updated'
    };
};

const moveToCart = async (userId, productId, variantId) => {
    ensureValidIds(productId, variantId);
    await cartService.addToCart(userId, productId, variantId, 1);
    await removeFromWishlist(userId, productId, variantId);

    return {
        success: true,
        message: 'Item moved to cart'
    };
};

module.exports = {
    getWishlist,
    addToWishlist,
    removeFromWishlist,
    moveToCart
};
