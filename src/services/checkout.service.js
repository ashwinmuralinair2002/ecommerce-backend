const cartService = require('./cart.service');
const Offer = require('../models/offer.model');
const User = require('../models/user.model');
const AppError = require('../utils/AppError');
const { getCachedOffers } = require('../utils/offer-cache');
const { calculatePricing } = require('../utils/pricing-engine');

const MAX_CART_ITEM_QUANTITY = 5;

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
        || quantity < 1
        || stockCount === 0
        || quantity > stockCount
        || quantity > MAX_CART_ITEM_QUANTITY
    );
};

const prepareCheckout = async (userId, req) => {
    try {
        const cart = await cartService.getCart(userId, req);

        if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
            throw new AppError('Cart is empty', 400);
        }

        if (cart.items.some(hasInvalidCartItem)) {
            throw new AppError('Invalid cart items present', 400);
        }

        const user = await User.findById(userId).select('addresses').lean();
        const addresses = user && Array.isArray(user.addresses) ? user.addresses : [];
        const selectedAddress = addresses.find((address) => address && address.isDefault === true);

        if (!selectedAddress) {
            throw new AppError('No delivery address selected', 400);
        }

        const activeOffers = await getCachedOffers(Offer);

        const pricingItems = cart.items.map((item) => {
            if (item.priceSnapshot == null) {
                console.warn('Missing priceSnapshot in checkout item', {
                    itemId: item?._id || null,
                    productId: item?.product?._id || null
                });
            }

            return {
                priceSnapshot: item.priceSnapshot != null
                    ? Number(item.priceSnapshot)
                    : 0,
                quantity: Number(item.quantity || 0),
                productId: item.product?._id || null,
                categoryId: item.product?.category?._id || item.product?.category || null,
                brandId: item.product?.brand?._id || item.product?.brand || null,
                selectedOfferId: item.selectedOfferId || null
            };
        });
        const pricing = calculatePricing(pricingItems, activeOffers);

        return {
            items: cart.items,
            pricing: {
                totalItems: pricing.totalItems,
                subtotal: pricing.subtotal,
                gst: pricing.gst,
                finalTotal: pricing.finalTotal
            },
            address: selectedAddress
        };
    } catch (error) {
        if (error instanceof AppError) {
            throw error;
        }

        throw new AppError('Checkout service failed', 500);
    }
};

module.exports = {
    prepareCheckout
};
