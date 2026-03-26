const Cart = require('../models/cart.model');
const Product = require('../models/Product');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

const MAX_CART_ITEM_QUANTITY = 5;
const GST_RATE = 0.18;

const roundCurrency = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

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
        throw new AppError('Product not available', 404);
    }

    const variant = product.variants.id(variantId);

    if (!variant) {
        throw new AppError('Variant not found', 404);
    }

    if (variant.stockCount <= 0) {
        throw new AppError('Out of stock', 400);
    }

    return { product, variant };
};

const validateRequestedQuantity = (quantity, stockCount) => {
    if (!Number.isInteger(quantity) || quantity < 1) {
        throw new AppError('Invalid quantity', 400);
    }

    if (quantity > stockCount) {
        throw new AppError('Quantity exceeds available stock', 400);
    }

    if (quantity > MAX_CART_ITEM_QUANTITY) {
        throw new AppError('Quantity limit exceeded', 400);
    }
};

const findCartItemIndex = (items, productId, variantId) => {
    return items.findIndex((item) => (
        item.productId.toString() === productId.toString()
        && item.variantId.toString() === variantId.toString()
    ));
};

const buildCartResponse = async (userId) => {
    const cart = await Cart.findOne({ userId }).populate({
        path: 'items.productId',
        select: 'title price originalPrice discountPercentage isListed isDeleted variants images'
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

        const currentPrice = typeof (product && product.price) === 'number' ? product.price : 0;
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
                originalPrice: product.originalPrice,
                discountPercentage: product.discountPercentage,
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
            hasPriceChanged: Boolean(product && savedPrice !== currentPrice),
            priceChange,
            isOutOfStock,
            isUnlisted,
            isVariantRecovered
        };
    });

    const subtotal = roundCurrency(items.reduce((total, item) => (
        total + ((Number(item.product && item.product.price) || Number(item.priceSnapshot) || 0) * item.quantity)
    ), 0));
    const gst = roundCurrency(subtotal * GST_RATE);
    const total = roundCurrency(subtotal + gst);

    return {
        _id: cart._id,
        userId: cart.userId,
        items,
        totalItems: items.reduce((total, item) => total + item.quantity, 0),
        subtotal,
        gst,
        total,
        createdAt: cart.createdAt,
        updatedAt: cart.updatedAt
    };
};

const addToCart = asyncHandler(async (userId, productId, variantId, quantity) => {
    const { product, variant } = await getValidatedProductAndVariant(productId, variantId);

    validateRequestedQuantity(quantity, variant.stockCount);

    let cart = await Cart.findOne({ userId });

    if (!cart) {
        cart = new Cart({
            userId,
            items: []
        });
    }

    const existingItemIndex = findCartItemIndex(cart.items, productId, variantId);

    if (existingItemIndex !== -1) {
        const updatedQuantity = cart.items[existingItemIndex].quantity + quantity;

        if (updatedQuantity > variant.stockCount) {
            throw new AppError('Quantity exceeds available stock', 400);
        }

        if (updatedQuantity > MAX_CART_ITEM_QUANTITY) {
            throw new AppError('Quantity limit exceeded', 400);
        }

        cart.items[existingItemIndex].quantity = updatedQuantity;
    } else {
        cart.items.push({
            productId,
            variantId,
            quantity,
            priceSnapshot: product.price,
            savedPrice: product.price
        });
    }

    await cart.save();

    return buildCartResponse(userId);
});

const getCart = asyncHandler(async (userId) => {
    return buildCartResponse(userId);
});

const updateCartItemQuantity = asyncHandler(async (userId, itemId, quantity) => {
    const cart = await Cart.findOne({ userId });

    if (!cart) {
        throw new AppError('Cart not found', 404);
    }

    const itemIndex = cart.items.findIndex(item => 
        item.productId.toString() === itemId.toString() || 
        (item._id && item._id.toString() === itemId.toString())
    );

    if (itemIndex === -1) {
        throw new AppError('Cart item not found', 404);
    }

    const cartItem = cart.items[itemIndex];
    const { product, variant } = await getValidatedProductAndVariant(cartItem.productId, cartItem.variantId);

    if (quantity > variant.stockCount) {
        throw new AppError('Quantity exceeds available stock', 400);
    }

    if (quantity > MAX_CART_ITEM_QUANTITY) {
        throw new AppError('Quantity limit exceeded', 400);
    }

    cartItem.quantity = quantity;

    await cart.save();

    return buildCartResponse(userId);
});

const removeCartItem = asyncHandler(async (userId, itemId) => {
    const cart = await Cart.findOne({ userId });

    if (!cart) {
        throw new AppError('Cart not found', 404);
    }

    const itemIndex = cart.items.findIndex(item => 
        item.productId.toString() === itemId.toString() || 
        (item._id && item._id.toString() === itemId.toString())
    );

    if (itemIndex === -1) {
        throw new AppError('Cart item not found', 404);
    }

    cart.items.splice(itemIndex, 1);

    await cart.save();

    return buildCartResponse(userId);
});

module.exports = {
    addToCart,
    getCart,
    updateCartItemQuantity,
    removeCartItem
};
