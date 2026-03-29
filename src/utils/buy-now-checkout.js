const Product = require('../models/Product');
const Offer = require('../models/offer.model');
const Coupon = require('../models/coupon.model');
const User = require('../models/user.model');
const AppError = require('./AppError');
const { getCachedOffers } = require('./offer-cache');
const { getCachedCoupons } = require('./coupon-cache');
const { getBestOffer } = require('./offer-engine');
const { getCartPriceSnapshot } = require('./pricing');
const { calculatePricing } = require('./pricing-engine');
const { validateCoupon, calculateCouponDiscount } = require('./coupon-engine');

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

    const product = await Product.findById(productId)
        .populate('category')
        .populate('brand')
        .lean();

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

    const unitPrice = roundCurrency(getCartPriceSnapshot(product));

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
    let couponValidationReason = '';
    const now = new Date();

    if (couponCode) {
        coupon = await Coupon.findOne({
            code: couponCode,
            isDeleted: false,
            isActive: true,
            startDate: { $lte: now },
            endDate: { $gte: now }
        }).lean();

        if (!coupon) {
            couponValidationReason = 'INVALID_COUPON';
        }
    }

    const couponMeta = coupon
        ? {
            code: coupon.code,
            discountType: coupon.discountType,
            discountValue: coupon.discountValue
        }
        : null;

    const buyNowProductContext = {
        _id: product._id,
        categoryId: product.category?._id || product.category || null,
        brandId: product.brand?._id || product.brand || null,
        priceSnapshot: Number(unitPrice ?? 0)
    };
    console.log('BUY NOW CONTEXT DEBUG:', buyNowProductContext);
    const bestOffer = getBestOffer(buyNowProductContext, activeOffers);
    const selectedOfferId = bestOffer?.offerId
        ? String(bestOffer.offerId)
        : null;
    console.log('BUY NOW OFFER DEBUG:', {
        bestOffer,
        selectedOfferId
    });
    const pricingItems = [{
        priceSnapshot: Number(unitPrice ?? 0),
        quantity: Number(quantity || 0),
        productId: product._id || null,
        categoryId: product.category?._id || product.category || null,
        brandId: product.brand?._id || product.brand || null,
        selectedOfferId
    }];
    console.log('BUY NOW PRICING ITEMS:', pricingItems);
    const pricing = await calculatePricing(pricingItems, activeOffers, coupon, userId);
    const finalCouponValidationReason = pricing.couponValidationReason || couponValidationReason;
    const pricingDetail = Array.isArray(pricing.itemsDetailed) ? pricing.itemsDetailed[0] || {} : {};
    const subtotal = Number(pricing.subtotal || 0);
    const availableCoupons = await getCachedCoupons(Coupon);
    const applicableCoupons = (await Promise.all(availableCoupons.map(async (entry, index) => {
            if (couponMeta && entry && entry.code === couponMeta.code) {
                return null;
            }

            try {
                const validation = await validateCoupon(entry, userId, subtotal);

                if (!validation.valid) {
                    return null;
                }

                const discount = calculateCouponDiscount(subtotal, entry);

                if (!discount || discount <= 0) {
                    return null;
                }

                return {
                    code: entry.code,
                    discount,
                    minOrderValue: Number(entry.minOrderValue || 0),
                    originalIndex: index
                };
            } catch (error) {
                console.warn('Failed to validate cached coupon for buy now checkout suggestions', {
                    couponId: entry?._id || null,
                    userId,
                    error: error?.message || error
                });

                return null;
            }
        })))
        .filter(Boolean)
        .sort((a, b) => {
            const discountDifference = Number(b.discount || 0) - Number(a.discount || 0);

            if (discountDifference !== 0) {
                return discountDifference;
            }

            const minOrderDifference = Number(a.minOrderValue || 0) - Number(b.minOrderValue || 0);

            if (minOrderDifference !== 0) {
                return minOrderDifference;
            }

            return Number(a.originalIndex || 0) - Number(b.originalIndex || 0);
        })
        .slice(0, 3)
        .map(({ originalIndex, ...entry }) => entry);

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
                selectedOfferId,
                offerDiscountPerUnit: Number(pricingDetail.offerDiscountPerUnit || 0),
                finalUnitPrice: Number(pricingDetail.finalUnitPrice || unitPrice),
                itemSubtotal: Number(pricingDetail.itemSubtotal || (unitPrice * quantity)),
                offerDiscount: Number(pricingDetail.offerDiscountTotal || 0),
                finalSubtotal: Number(pricingDetail.finalSubtotal || 0),
                gstAmount: Number(pricingDetail.gstAmount || 0),
                finalPrice: Number(pricingDetail.finalPrice || 0)
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
            couponValidationReason: finalCouponValidationReason,
            itemsDetailed: Array.isArray(pricing.itemsDetailed) ? pricing.itemsDetailed : []
        },
        coupon: couponMeta,
        availableCoupons: applicableCoupons,
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
