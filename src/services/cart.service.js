const mongoose = require('mongoose');
const Cart = require('../models/cart.model');
const Wishlist = require('../models/wishlist.model');
const Offer = require('../models/offer.model');
const Product = require('../models/Product');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { getCachedOffers } = require('../utils/offer-cache');
const { getBaseProductPrice, getCartPriceSnapshot } = require('../utils/pricing');
const { calculatePricing } = require('../utils/pricing-engine');
const HTTP_STATUS = require('../constants/http-status');

const MAX_CART_ITEM_QUANTITY = 5;
const normalizeSelectedOfferId = (selectedOfferId) => (
    selectedOfferId && mongoose.Types.ObjectId.isValid(selectedOfferId)
        ? String(selectedOfferId)
        : null
);

const getProductImageUrl = (product) => {
    const images = product && Array.isArray(product.images) ? product.images : [];
    const heroImage = images.find((image) => image && image.isHero === true);
    const fallbackImage = images.find((image) => image && typeof image.url === 'string' && image.url.trim().length > 0);
    const selectedImage = heroImage || fallbackImage;

    if (selectedImage && typeof selectedImage.url === 'string' && selectedImage.url.trim().length > 0) {
        return selectedImage.url;
    }

    return '/images/placeholder.png';
};

const getValidatedProductAndVariant = async (productId, variantId) => {
    const product = await Product.findById(productId);

    if (!product || product.isListed !== true || product.isDeleted === true) {
        throw new AppError('Product not available', HTTP_STATUS.NOT_FOUND);
    }

    const variant = product.variants.id(variantId);

    if (!variant) {
        throw new AppError('Variant not found', HTTP_STATUS.NOT_FOUND);
    }

    if (variant.stockCount <= 0) {
        throw new AppError('Out of stock', HTTP_STATUS.BAD_REQUEST);
    }

    return { product, variant };
};

const validateRequestedQuantity = (quantity, stockCount) => {
    if (!Number.isInteger(quantity) || quantity < 1) {
        throw new AppError('Invalid quantity', HTTP_STATUS.BAD_REQUEST);
    }

    if (quantity > stockCount) {
        throw new AppError('Quantity exceeds available stock', HTTP_STATUS.BAD_REQUEST);
    }

    if (quantity > MAX_CART_ITEM_QUANTITY) {
        throw new AppError('Quantity limit exceeded', HTTP_STATUS.BAD_REQUEST);
    }
};

const findCartItemIndex = (items, productId, variantId, selectedOfferId = null) => {
    return items.findIndex((item) => (
        item.productId.toString() === productId.toString()
        && item.variantId.toString() === variantId.toString()
        && String(item.selectedOfferId || '') === String(selectedOfferId || '')
    ));
};

const findCartItemIndexByVariant = (items, productId, variantId) => {
    return items.findIndex((item) => (
        item.productId.toString() === productId.toString()
        && item.variantId.toString() === variantId.toString()
    ));
};

const isProductInCart = async (userId, productId) => {
    const existingCartItem = await Cart.findOne({
        userId,
        'items.productId': productId
    }).select('_id').lean();

    return Boolean(existingCartItem);
};

const buildCartResponse = async (userId, req) => {
    const cart = await Cart.findOne({ userId }).populate({
        path: 'items.productId',
        select: 'title price originalPrice discountPercentage isListed isDeleted variants images category brand'
    });

    if (!cart) {
        return {
            items: [],
            totalItems: 0,
            subtotal: 0,
            gst: 0,
            total: 0
        };
    }

    const items = cart.items.map((item) => {
        const product = item.productId;
        let variant = product ? product.variants.id(item.variantId) : null;
        const fallbackVariant = !variant && product && Array.isArray(product.variants) && product.variants.length > 0
            ? product.variants[0]
            : null;

        if (!variant && fallbackVariant) {
            variant = fallbackVariant;
        }

        const computedPrice = product ? getBaseProductPrice(product) : 0;
        const currentPrice = computedPrice;
        const savedPrice = Number(item.savedPrice || item.priceSnapshot || currentPrice);
        const priceChange = currentPrice - savedPrice;
        const isUnlisted = !product || product.isListed !== true || product.isDeleted === true;
        const isOutOfStock = !variant || Number(variant.stockCount || 0) <= 0;
        const isVariantRecovered = !product?.variants.id(item.variantId) && Boolean(fallbackVariant);

        return {
            productId: item.productId && item.productId._id ? String(item.productId._id) : String(item.productId),
            variantId: String(item.variantId),
            product: product ? {
                _id: product._id,
                title: product.title,
                price: product.price,
                discountPercentage: product.discountPercentage,
                category: product.category || null,
                brand: product.brand || null,
                computedPrice,
                imageUrl: getProductImageUrl(product),
                isListed: product.isListed,
                isDeleted: product.isDeleted
            } : {
                _id: item.productId,
                title: null,
                price: null,
                imageUrl: '/images/placeholder.png',
                isListed: false,
                isDeleted: true
            },
            variant: variant ? {
                _id: variant._id,
                stockCount: variant.stockCount,
                images: Array.isArray(variant.images) ? variant.images : []
            } : {
                _id: item.variantId,
                stockCount: 0,
                images: []
            },
            quantity: item.quantity,
            priceSnapshot: item.priceSnapshot,
            selectedOfferId: item.selectedOfferId ? String(item.selectedOfferId) : null,
            hasPriceChanged: Boolean(product && savedPrice !== currentPrice),
            priceChange,
            isOutOfStock,
            isUnlisted,
            isVariantRecovered
        };
    });

    const activeOffers = await getCachedOffers(Offer);

    const pricingItems = items.map((item) => ({
        priceSnapshot: Number(item.priceSnapshot ?? (item.product ? getBaseProductPrice(item.product) : 0)),
        quantity: item.quantity,
        productId: item.product?._id || null,
        categoryId: item.product?.category?._id || item.product?.category || null,
        brandId: item.product?.brand?._id || item.product?.brand || null,
        selectedOfferId: item.selectedOfferId || null
    }));
    const oldSubtotal = pricingItems.reduce((total, item) => (
        total + (item.priceSnapshot * item.quantity)
    ), 0);
    const pricing = await calculatePricing(pricingItems, activeOffers);
    const enrichedItems = items.map((item, index) => {
        const pricingItem = pricing.itemsWithOffers[index] || {};

        return {
            ...item,
            finalUnitPrice: pricingItem.finalUnitPrice ?? item.priceSnapshot,
            offerDiscountPerUnit: pricingItem.offerDiscountPerUnit ?? 0,
            itemSubtotal: pricingItem.itemSubtotal ?? (item.priceSnapshot * item.quantity)
        };
    });

    console.log('CART PRICING CHECK:', {
        oldSubtotal,
        newSubtotal: pricing.subtotal
    });
    return {
        _id: cart._id,
        userId: cart.userId,
        items: enrichedItems,
        itemsWithOffers: pricing.itemsWithOffers,
        offerDiscountTotal: pricing.offerDiscountTotal,
        pricing: {
            offerDiscountTotal: pricing.offerDiscountTotal
        },
        totalItems: pricing.totalItems,
        subtotal: pricing.subtotal,
        gst: pricing.gst,
        total: pricing.finalTotal,
        createdAt: cart.createdAt,
        updatedAt: cart.updatedAt
    };
};

const addToCart = asyncHandler(async (userId, productId, variantId, quantity, req, selectedOfferId = null) => {
    const { product, variant } = await getValidatedProductAndVariant(productId, variantId);
    const normalizedSelectedOfferId = normalizeSelectedOfferId(selectedOfferId);

    validateRequestedQuantity(quantity, variant.stockCount);

    let cart = await Cart.findOne({ userId });

    if (!cart) {
        cart = new Cart({
            userId,
            items: []
        });
    }

    const existingItemIndex = findCartItemIndexByVariant(
        cart.items,
        productId,
        variantId
    );

    if (existingItemIndex !== -1) {
        const updatedQuantity = cart.items[existingItemIndex].quantity + quantity;

        if (updatedQuantity > variant.stockCount) {
            throw new AppError('Quantity exceeds available stock', HTTP_STATUS.BAD_REQUEST);
        }

        if (updatedQuantity > MAX_CART_ITEM_QUANTITY) {
            throw new AppError('Quantity limit exceeded', HTTP_STATUS.BAD_REQUEST);
        }

        cart.items[existingItemIndex].quantity = updatedQuantity;
        cart.items[existingItemIndex].selectedOfferId = normalizedSelectedOfferId;
    } else {
        const priceSnapshot = getCartPriceSnapshot(product);

        cart.items.push({
            productId,
            variantId,
            quantity,
            priceSnapshot,
            savedPrice: priceSnapshot,
            selectedOfferId: normalizedSelectedOfferId
        });
    }

    await cart.save();
    await Wishlist.updateOne(
        { user: userId },
        { $pull: { items: { productId } } }
    );

    return buildCartResponse(userId, req);
});

const getCart = asyncHandler(async (userId, req) => {
    return buildCartResponse(userId, req);
});

const updateCartItemQuantity = asyncHandler(async (userId, productId, variantId, quantity, req, selectedOfferId = null) => {
    const cart = await Cart.findOne({ userId });

    if (!cart) {
        throw new AppError('Cart not found', HTTP_STATUS.NOT_FOUND);
    }

    const normalizedSelectedOfferId = normalizeSelectedOfferId(selectedOfferId);
    const itemIndex = findCartItemIndex(
        cart.items,
        productId,
        variantId,
        normalizedSelectedOfferId
    );

    if (itemIndex === -1) {
        throw new AppError('Cart item not found', HTTP_STATUS.NOT_FOUND);
    }

    const cartItem = cart.items[itemIndex];
    const product = await Product.findById(cartItem.productId);

    if (!product || product.isListed !== true || product.isDeleted === true) {
        throw new AppError('Product not available', HTTP_STATUS.NOT_FOUND);
    }

    let variant = product.variants.id(cartItem.variantId);
    // try the stored cart variant id against the current product variants

    if (!variant) {
        throw new AppError('Item is no longer available. Please remove it from cart.', HTTP_STATUS.BAD_REQUEST);
    }
    // stale cart variant ids should fail gracefully with a user-friendly message

    if (quantity > variant.stockCount && quantity > cartItem.quantity) {
        throw new AppError('Quantity exceeds available stock', HTTP_STATUS.BAD_REQUEST);
    }

    if (quantity > MAX_CART_ITEM_QUANTITY) {
        throw new AppError('Quantity limit exceeded', HTTP_STATUS.BAD_REQUEST);
    }

    cartItem.quantity = quantity;

    await cart.save();

    return buildCartResponse(userId, req);
});

const removeCartItem = asyncHandler(async (userId, productId, variantId, req) => {
    const cart = await Cart.findOne({ userId });

    if (!cart) {
        return buildCartResponse(userId, req);
    }

    const itemIndex = findCartItemIndexByVariant(
        cart.items,
        productId,
        variantId
    );

    if (itemIndex === -1) {
        return buildCartResponse(userId, req);
    }

    cart.items.splice(itemIndex, 1);

    await cart.save();

    return buildCartResponse(userId, req);
});

module.exports = {
    isProductInCart,
    addToCart,
    getCart,
    updateCartItemQuantity,
    removeCartItem
};
