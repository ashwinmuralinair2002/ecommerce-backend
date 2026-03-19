const Cart = require('../models/cart.model');
const Product = require('../models/Product');

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
        throw new Error('Product not available');
    }

    const variant = product.variants.id(variantId);

    if (!variant) {
        throw new Error('Variant not found');
    }

    if (variant.stockCount <= 0) {
        throw new Error('Out of stock');
    }

    return { product, variant };
};

const validateRequestedQuantity = (quantity, stockCount) => {
    if (!Number.isInteger(quantity) || quantity < 1) {
        throw new Error('Invalid quantity');
    }

    if (quantity > stockCount) {
        throw new Error('Quantity exceeds available stock');
    }

    if (quantity > MAX_CART_ITEM_QUANTITY) {
        throw new Error('Quantity limit exceeded');
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
        select: 'title price isListed isDeleted variants images'
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
        const variant = product ? product.variants.id(item.variantId) : null;

        return {
            product: product ? {
                _id: product._id,
                title: product.title,
                price: product.price,
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
            hasPriceChanged: Boolean(product && item.priceSnapshot !== product.price)
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

const addToCart = async (userId, productId, variantId, quantity) => {
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
            throw new Error('Quantity exceeds available stock');
        }

        if (updatedQuantity > MAX_CART_ITEM_QUANTITY) {
            throw new Error('Quantity limit exceeded');
        }

        cart.items[existingItemIndex].quantity = updatedQuantity;
    } else {
        cart.items.push({
            productId,
            variantId,
            quantity,
            priceSnapshot: product.price
        });
    }

    await cart.save();

    return buildCartResponse(userId);
};

const getCart = async (userId) => {
    return buildCartResponse(userId);
};

const updateCartItemQuantity = async (userId, productId, variantId, action) => {
    if (!['increment', 'decrement'].includes(action)) {
        throw new Error('Invalid action');
    }

    const cart = await Cart.findOne({ userId });

    if (!cart) {
        throw new Error('Cart not found');
    }

    const itemIndex = findCartItemIndex(cart.items, productId, variantId);

    if (itemIndex === -1) {
        throw new Error('Cart item not found');
    }

    const { product, variant } = await getValidatedProductAndVariant(productId, variantId);
    const cartItem = cart.items[itemIndex];

    if (action === 'increment') {
        const updatedQuantity = cartItem.quantity + 1;

        if (updatedQuantity > variant.stockCount) {
            throw new Error('Quantity exceeds available stock');
        }

        if (updatedQuantity > MAX_CART_ITEM_QUANTITY) {
            throw new Error('Quantity limit exceeded');
        }

        cartItem.quantity = updatedQuantity;
    }

    if (action === 'decrement') {
        cartItem.quantity = Math.max(1, cartItem.quantity - 1);
    }

    await cart.save();

    return buildCartResponse(userId);
};

const removeCartItem = async (userId, productId, variantId) => {
    const cart = await Cart.findOne({ userId });

    if (!cart) {
        throw new Error('Cart not found');
    }

    const itemIndex = findCartItemIndex(cart.items, productId, variantId);

    if (itemIndex === -1) {
        throw new Error('Cart item not found');
    }

    cart.items.splice(itemIndex, 1);

    await cart.save();

    return buildCartResponse(userId);
};

module.exports = {
    addToCart,
    getCart,
    updateCartItemQuantity,
    removeCartItem
};
