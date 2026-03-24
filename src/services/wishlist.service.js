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
    let variant = product && Array.isArray(product.variants)
        ? product.variants.find((entry) => String(entry._id) === String(item.variantId))
        : null;
    const fallbackVariant = !variant && product && Array.isArray(product.variants) && product.variants.length > 0
        ? product.variants[0]
        : null;

    if (!variant && fallbackVariant) {
        variant = fallbackVariant;
    }

    const currentPrice = product ? product.price : 0;
    const savedPrice = Number(item.savedPrice || currentPrice);
    const priceChange = currentPrice - savedPrice;
    let images = [];

    if (product) {
        if (variant && Array.isArray(variant.images) && variant.images.length) {
            images = variant.images;
        } else if (Array.isArray(product.images) && product.images.length) {
            images = product.images;
        }
    }

    return {
        product: product ? {
            _id: product._id,
            name: product.title,
            price: product.price,
            images,
            variantName: variant ? variant.colorName : '',
            priceChange
        } : null,
        productId: product ? product._id : item.productId,
        variantId: item.variantId,
        savedPrice,
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

const getWishlistCount = async (userId) => {
    const wishlist = await Wishlist.findOne({ user: userId }).select('items.variantId').lean();
    return Array.isArray(wishlist && wishlist.items) ? wishlist.items.length : 0;
};

const addToWishlist = async (userId, productId, variantId) => {
    const { product } = await getValidatedProductAndVariant(productId, variantId);
    const wishlistItem = {
        productId,
        variantId,
        savedPrice: product.price
    };

    let alreadyExists = false;
    let wasInserted = false;
    let wishlist = await Wishlist.findOneAndUpdate(
        {
            user: userId,
            items: {
                $not: {
                    $elemMatch: {
                        productId,
                        variantId
                    }
                }
            }
        },
        {
            $push: {
                items: wishlistItem
            }
        },
        {
            new: true
        }
    );
    wasInserted = Boolean(wishlist);

    if (!wishlist) {
        wishlist = await Wishlist.findOne({ user: userId });

        if (!wishlist) {
            try {
                wishlist = await Wishlist.create({
                    user: userId,
                    items: [wishlistItem]
                });
                wasInserted = true;
            } catch (error) {
                if (error && error.code !== 11000) {
                    throw error;
                }

                wishlist = await Wishlist.findOne({ user: userId });
            }
        }

        alreadyExists = !wasInserted && Array.isArray(wishlist.items)
            ? wishlist.items.some((item) => isMatchingItem(item, productId, variantId))
            : false;

        if (!alreadyExists) {
            wishlist.items.push(wishlistItem);
            await wishlist.save();
        }
    }

    return {
        success: true,
        alreadyExists,
        wishlistCount: await getWishlistCount(userId),
        message: alreadyExists ? 'Already in wishlist' : 'Added to wishlist'
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
        wishlistCount: await getWishlistCount(userId),
        message: 'Wishlist updated'
    };
};

const moveToCart = async (userId, productId, variantId) => {
    ensureValidIds(productId, variantId);
    await cartService.addToCart(userId, productId, variantId, 1);
    await removeFromWishlist(userId, productId, variantId);

    return {
        success: true,
        wishlistCount: await getWishlistCount(userId),
        message: 'Item moved to cart'
    };
};

module.exports = {
    getWishlist,
    getWishlistCount,
    addToWishlist,
    removeFromWishlist,
    moveToCart
};
