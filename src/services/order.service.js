const Cart = require('../models/cart.model');
const Order = require('../models/order.model');
const Product = require('../models/Product');
const checkoutService = require('./checkout.service');

const roundCurrency = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const buildShippingAddress = (address) => {
    return {
        name: address.name,
        phone: address.phone,
        addressLine1: [address.houseNo, address.originalStreet || address.street].filter(Boolean).join(', '),
        city: address.city,
        state: address.state,
        pincode: address.zip || address.postalCode || ''
    };
};

const placeOrder = async (userId) => {
    const checkoutData = await checkoutService.prepareCheckout(userId);
    const orderId = `ORD-${Date.now()}`;

    try {
        const orderItems = [];

        for (const item of checkoutData.items) {
            const product = await Product.findById(item.product && item.product._id);

            if (!product || product.isListed === false || product.isDeleted === true) {
                throw new Error('Invalid cart items present');
            }

            const variant = product.variants.id(item.variant && item.variant._id);
            const quantity = Number(item.quantity || 0);

            if (!variant || Number(variant.stockCount || 0) === 0 || quantity > 5) {
                throw new Error('Invalid cart items present');
            }

            if (Number(variant.stockCount || 0) < quantity) {
                throw new Error('Stock changed, please refresh');
            }

            const price = Number(item.product && typeof item.product.price === 'number' ? item.product.price : item.priceSnapshot || 0);
            const totalPrice = roundCurrency(price * quantity);
            const checkoutVariant = item && item.variant ? item.variant : {};
            const variantImages = Array.isArray(checkoutVariant.images) ? checkoutVariant.images : [];
            const variantImage = variantImages[0];
            const imageUrl = (variantImage && variantImage.url)
                ? variantImage.url
                : '/images/placeholder.png';

            orderItems.push({
                productId: product._id,
                productName: product.title,
                variantId: variant._id,
                colorName: variant.colorName || '',
                quantity,
                price,
                totalPrice,
                imageUrl,
                status: 'pending'
            });

            variant.stockCount -= quantity;
            await product.save();
        }

        const order = new Order({
            orderId,
            user: userId,
            items: orderItems,
            pricing: checkoutData.pricing,
            shippingAddress: buildShippingAddress(checkoutData.address),
            paymentMethod: 'COD',
            orderStatus: 'pending',
            totalAmount: checkoutData.pricing.finalTotal
        });

        await order.save();

        await Cart.findOneAndUpdate(
            { userId },
            { $set: { items: [] } }
        );

        return order.orderId;
    } catch (error) {
        throw error;
    }
};

module.exports = {
    placeOrder
};
