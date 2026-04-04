const cartService = require('./cart.service');
const Offer = require('../models/offer.model');
const Coupon = require('../models/coupon.model');
const User = require('../models/user.model');
const AppError = require('../utils/AppError');
const { getCachedOffers } = require('../utils/offer-cache');
const { getCachedCoupons } = require('../utils/coupon-cache');
const { calculatePricing } = require('../utils/pricing-engine');
const { validateCoupon, calculateCouponDiscount } = require('../utils/coupon-engine');
const HTTP_STATUS = require('../constants/http-status');

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
            throw new AppError('Cart is empty', HTTP_STATUS.BAD_REQUEST);
        }

        if (cart.items.some(hasInvalidCartItem)) {
            throw new AppError('Invalid cart items present', HTTP_STATUS.BAD_REQUEST);
        }

        const user = await User.findById(userId).select('addresses').lean();
        const addresses = user && Array.isArray(user.addresses) ? user.addresses : [];
        const selectedAddress = addresses.find((address) => address && address.isDefault === true);

        if (!selectedAddress) {
            throw new AppError('No delivery address selected', HTTP_STATUS.BAD_REQUEST);
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
        const pricing = await calculatePricing(pricingItems, activeOffers, coupon, userId);
        const finalCouponValidationReason = pricing.couponValidationReason || couponValidationReason;
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
                    console.warn('Failed to validate cached coupon for checkout suggestions', {
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
            items: cart.items,
            pricing: {
                totalItems: pricing.totalItems,
                subtotal: pricing.subtotal,
                gst: pricing.gst,
                finalTotal: pricing.finalTotal,
                offerDiscountTotal: pricing.offerDiscountTotal,
                couponDiscount: pricing.couponDiscount,
                discountedSubtotal: pricing.discountedSubtotal,
                couponApplied: pricing.couponApplied,
                couponValidationReason: finalCouponValidationReason
            },
            coupon: couponMeta,
            availableCoupons: applicableCoupons,
            address: selectedAddress
        };
    } catch (error) {
        if (error instanceof AppError) {
            throw error;
        }

        throw new AppError('Checkout service failed', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
};

module.exports = {
    prepareCheckout
};
