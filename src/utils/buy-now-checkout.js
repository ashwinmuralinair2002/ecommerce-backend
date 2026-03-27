const Product = require('../models/Product');
const User = require('../models/user.model');
const AppError = require('./AppError');
const { getBaseProductPrice } = require('./pricing');

const MAX_CART_ITEM_QUANTITY = 5;
const GST_RATE = 0.18;

const roundCurrency = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const resolveBuyNowSelection = async (buyNowItem) => {
    const productId = buyNowItem && buyNowItem.productId ? String(buyNowItem.productId) : '';
    const variantId = buyNowItem && buyNowItem.variantId ? String(buyNowItem.variantId) : '';
    const quantity = Number(buyNowItem && buyNowItem.quantity ? buyNowItem.quantity : 0);

    if (!productId || !variantId) {
        throw new AppError('Invalid product selection', 400);
    }

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_CART_ITEM_QUANTITY) {
        throw new AppError('Invalid quantity', 400);
    }

    const product = await Product.findById(productId).lean();

    if (!product || product.isListed !== true || product.isDeleted === true) {
        throw new AppError('Product not available', 404);
    }

    const variant = Array.isArray(product.variants)
        ? product.variants.find((entry) => String(entry && entry._id) === variantId)
        : null;

    if (!variant) {
        throw new AppError('Variant not found', 404);
    }

    if (Number(variant.stockCount || 0) <= 0) {
        throw new AppError('Out of stock', 400);
    }

    if (quantity > Number(variant.stockCount || 0)) {
        throw new AppError('Quantity exceeds available stock', 400);
    }

    const unitPrice = roundCurrency(getBaseProductPrice(product));

    return {
        product,
        variant,
        quantity,
        unitPrice
    };
};

const buildBuyNowCheckoutData = async (userId, buyNowItem) => {
    const [{ product, variant, quantity, unitPrice }, user] = await Promise.all([
        resolveBuyNowSelection(buyNowItem),
        User.findById(userId).select('addresses').lean()
    ]);

    const addresses = user && Array.isArray(user.addresses) ? user.addresses : [];
    const selectedAddress = addresses.find((address) => address && address.isDefault === true);

    if (!selectedAddress) {
        throw new AppError('No delivery address selected', 400);
    }

    const subtotal = roundCurrency(unitPrice * quantity);
    const gst = roundCurrency(subtotal * GST_RATE);
    const finalTotal = roundCurrency(subtotal + gst);

    return {
        items: [
            {
                productId: String(product._id),
                variantId: String(variant._id),
                product: {
                    _id: product._id,
                    title: product.title,
                    price: product.price,
                    discountPercentage: product.discountPercentage,
                    isListed: product.isListed,
                    isDeleted: product.isDeleted
                },
                variant: {
                    _id: variant._id,
                    colorName: variant.colorName || '',
                    stockCount: variant.stockCount,
                    images: Array.isArray(variant.images) ? variant.images : []
                },
                quantity,
                priceSnapshot: unitPrice
            }
        ],
        pricing: {
            totalItems: quantity,
            subtotal,
            gst,
            finalTotal
        },
        address: selectedAddress
    };
};

const buildBuyNowCartItem = async (buyNowItem) => {
    const { product, variant, quantity, unitPrice } = await resolveBuyNowSelection(buyNowItem);

    return {
        productId: product._id,
        variantId: variant._id,
        quantity,
        priceSnapshot: unitPrice,
        savedPrice: unitPrice
    };
};

module.exports = {
    buildBuyNowCheckoutData,
    buildBuyNowCartItem
};
