const mongoose = require('mongoose');
const Wishlist = require('../models/wishlist.model');
const Product = require('../models/Product');
const cartService = require('./cart.service');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const HTTP_STATUS = require('../constants/http-status');

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const ensureValidIds = (productId, variantId) => {
    if (!isValidObjectId(productId) || !isValidObjectId(variantId)) {
        throw new AppError('Invalid product or variant', HTTP_STATUS.BAD_REQUEST);
    }
};

const getValidatedProductAndVariant = async (productId, variantId) => {
    ensureValidIds(productId, variantId);

    const product = await Product.findById(productId).select('title price discountPercentage images variants isListed isDeleted');

    if (!product) {
        throw new AppError('Product not found', HTTP_STATUS.NOT_FOUND);
    }

    if (product.isListed !== true || product.isDeleted === true) {
        throw new AppError('Product not available', HTTP_STATUS.NOT_FOUND);
    }

    const variant = product.variants.id(variantId);

    if (!variant) {
        throw new AppError('Variant not found', HTTP_STATUS.NOT_FOUND);
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
            discountPercentage: product.discountPercentage,
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
            select: 'title price discountPercentage images variants'
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

const getWishlist = asyncHandler(async (userId) => buildWishlistResponse(userId));

const getWishlistCount = asyncHandler(async (userId) => {
    const wishlist = await Wishlist.findOne({ user: userId }).select('items.variantId').lean();
    return Array.isArray(wishlist && wishlist.items) ? wishlist.items.length : 0;
});

const addToWishlist = asyncHandler(async (userId, productId, variantId) => {
    const { product } = await getValidatedProductAndVariant(productId, variantId);
    const existsInCart = await cartService.isProductInCart(userId, productId);

    if (existsInCart) {
        throw new AppError('Product is already in cart', HTTP_STATUS.BAD_REQUEST);
    }

    const wishlistItem = {
        productId,
        variantId,
        savedPrice: product.price
    };

    let alreadyExists = false;
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
    if (!wishlist) {
        wishlist = await Wishlist.findOne({ user: userId });

        if (!wishlist) {
            try {
                await Wishlist.create({
                    user: userId,
                    items: [wishlistItem]
                });

                return {
                    success: true,
                    alreadyExists,
                    wishlistCount: await getWishlistCount(userId),
                    message: 'Added to wishlist'
                };
            } catch (error) {
                if (error && error.code !== 11000) {
                    throw error;
                }

                wishlist = await Wishlist.findOne({ user: userId });
            }
        }

        alreadyExists = Array.isArray(wishlist.items)
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
});

const removeFromWishlist = asyncHandler(async (userId, productId, variantId) => {
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
});

const moveToCart = asyncHandler(async (userId, productId, variantId) => {
    ensureValidIds(productId, variantId);

    const alreadyInCart = await cartService.isProductInCart(userId, productId);

    if (alreadyInCart) {
        await removeFromWishlist(userId, productId, variantId);

        return {
            success: true,
            wishlistCount: await getWishlistCount(userId),
            message: 'Item already in cart, removed from wishlist'
        };
    }

    await cartService.addToCart(userId, productId, variantId, 1);
    await removeFromWishlist(userId, productId, variantId);

    return {
        success: true,
        wishlistCount: await getWishlistCount(userId),
        message: 'Item moved to cart'
    };
});

module.exports = {
    getWishlist,
    getWishlistCount,
    addToWishlist,
    removeFromWishlist,
    moveToCart
};
