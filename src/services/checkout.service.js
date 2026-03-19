const cartService = require('./cart.service');
const User = require('../models/user.model');

const GST_RATE = 0.18;
const MAX_CART_ITEM_QUANTITY = 5;

const roundCurrency = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const getItemUnitPrice = (item) => {
    if (item && item.product && typeof item.product.price === 'number') {
        return item.product.price;
    }

    return Number(item && item.priceSnapshot ? item.priceSnapshot : 0);
};

const hasInvalidCartItem = (item) => {
    const product = item ? item.product : null;
    const variant = item && item.variant ? item.variant : {};
    const quantity = Number(item && item.quantity ? item.quantity : 0);
    const stockCount = Number(variant.stockCount || 0);

    return (
        !product
        ||
        product.isListed === false
        || product.isDeleted === true
        || stockCount === 0
        || quantity > stockCount
        || quantity > MAX_CART_ITEM_QUANTITY
    );
};

const prepareCheckout = async (userId) => {
    const cart = await cartService.getCart(userId);

    if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
        throw new Error('Cart is empty');
    }

    if (cart.items.some(hasInvalidCartItem)) {
        throw new Error('Invalid cart items present');
    }

    const user = await User.findById(userId).select('addresses').lean();
    const addresses = user && Array.isArray(user.addresses) ? user.addresses : [];
    const selectedAddress = addresses.find((address) => address && address.isDefault === true);

    if (!selectedAddress) {
        throw new Error('No delivery address selected');
    }

    const totalItems = cart.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const subtotal = roundCurrency(cart.items.reduce((sum, item) => {
        return sum + (getItemUnitPrice(item) * Number(item.quantity || 0));
    }, 0));
    const gst = roundCurrency(subtotal * GST_RATE);
    const finalTotal = roundCurrency(subtotal + gst);

    return {
        items: cart.items,
        pricing: {
            totalItems,
            subtotal,
            gst,
            finalTotal
        },
        address: selectedAddress
    };
};

module.exports = {
    prepareCheckout
};
