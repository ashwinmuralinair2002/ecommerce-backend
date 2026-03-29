const Product = require('../models/Product');
const Offer = require('../models/offer.model');
const Coupon = require('../models/coupon.model');
const User = require('../models/user.model');
const AppError = require('./AppError');
const { getCachedOffers } = require('./offer-cache');
const { getBaseProductPrice } = require('./pricing');
const { calculatePricing } = require('./pricing-engine');

const MAX_CART_ITEM_QUANTITY = 5;

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

const buildBuyNowCheckoutData = async (userId, buyNowItem, req) => {
    const [{ product, variant, quantity, unitPrice }, user] = await Promise.all([
        resolveBuyNowSelection(buyNowItem),
        User.findById(userId).select('addresses').lean()
    ]);

    const addresses = user && Array.isArray(user.addresses) ? user.addresses : [];
    const selectedAddress = addresses.find((address) => address && address.isDefault === true);

    if (!selectedAddress) {
        throw new AppError('No delivery address selected', 400);
    }

    const activeOffers = await getCachedOffers(Offer);
    const couponCodeRaw = req?.body?.couponCode || req?.query?.couponCode || '';
    const couponCode = String(couponCodeRaw)
        .trim()
        .toUpperCase();
    let coupon = null;
    const now = new Date();

    if (couponCode) {
        coupon = await Coupon.findOne({
            code: couponCode,
            isDeleted: false,
            isActive: true,
            startDate: { $lte: now },
            endDate: { $gte: now }
        }).lean();
    }

    const couponMeta = coupon
        ? {
            code: coupon.code,
            discountType: coupon.discountType,
            discountValue: coupon.discountValue
        }
        : null;

    const pricingItems = [{
        priceSnapshot: Number(unitPrice ?? 0),
        quantity: Number(quantity || 0),
        productId: String(product._id),
        categoryId: product.category?._id || product.category || null,
        brandId: product.brand?._id || product.brand || null,
        selectedOfferId: buyNowItem?.selectedOfferId || null
    }];
    const pricing = await calculatePricing(pricingItems, activeOffers, coupon, userId);

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
                priceSnapshot: unitPrice,
                selectedOfferId: buyNowItem?.selectedOfferId || null
            }
        ],
        pricing: {
            totalItems: pricing.totalItems,
            subtotal: pricing.subtotal,
            gst: pricing.gst,
            finalTotal: pricing.finalTotal,
            offerDiscountTotal: pricing.offerDiscountTotal,
            couponDiscount: pricing.couponDiscount,
            discountedSubtotal: pricing.discountedSubtotal,
            couponApplied: pricing.couponApplied,
            couponValidationReason: pricing.couponValidationReason
        },
        coupon: couponMeta,
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
