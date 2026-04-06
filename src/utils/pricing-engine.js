const { getApplicableOffers, getBestOffer, calculateOfferDiscount } = require('./offer-engine');
const { validateCoupon, calculateCouponDiscount } = require('./coupon-engine');

const getGstRate = () => Number(process.env.GST_RATE || 0.18);

// Mirrors the existing rounding behavior currently duplicated in
// cart.service.js, checkout.service.js, buy-now-checkout.js, and order.service.js.
const roundCurrency = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const distributeAmountProportionally = (items = [], totalAmount = 0, baseSelector = () => 0) => {
    const safeTotalAmount = roundCurrency(Number.isFinite(Number(totalAmount)) ? Number(totalAmount) : 0);

    if (!Array.isArray(items) || items.length === 0) {
        return [];
    }

    if (safeTotalAmount === 0) {
        return items.map(() => 0);
    }

    if (items.length === 1) {
        return [safeTotalAmount];
    }

    const baseValues = items.map((item) => {
        const baseValue = Number(baseSelector(item));

        return Number.isFinite(baseValue) && baseValue > 0 ? baseValue : 0;
    });
    const totalBase = roundCurrency(baseValues.reduce((sum, value) => sum + value, 0));

    if (totalBase <= 0) {
        const allocations = items.map(() => 0);
        allocations[allocations.length - 1] = safeTotalAmount;

        return allocations;
    }

    let allocatedAmount = 0;

    return items.map((item, index) => {
        if (index === items.length - 1) {
            return roundCurrency(safeTotalAmount - allocatedAmount);
        }

        const itemBase = baseValues[index];
        const allocation = roundCurrency((itemBase / totalBase) * safeTotalAmount);
        allocatedAmount = roundCurrency(allocatedAmount + allocation);

        return allocation;
    });
};

// Centralized pricing engine for future integration.
// This file intentionally duplicates the current formula without changing any
// live business logic yet, so existing cart, checkout, order, payment, and
// wallet flows continue to run exactly as they do today.
//
// Current pricing logic was traced from:
// - src/services/cart.service.js
// - src/services/checkout.service.js
// - src/utils/buy-now-checkout.js
// - src/services/order.service.js
//
// Duplication exists today because each flow computes pricing locally. This
// utility is meant to become the future single source of truth during a later,
// separate integration phase.
const calculatePricing = async (cartItems = [], offers = [], coupon = null, userId = null) => {
    if (!Array.isArray(cartItems)) {
        console.warn('Invalid cartItems passed to pricing engine');

        return {
            totalItems: 0,
            subtotal: 0,
            gst: 0,
            finalTotal: 0,
            offerDiscountTotal: 0,
            couponDiscount: 0,
            discountedSubtotal: 0,
            couponApplied: false,
            couponValidationReason: '',
            itemsWithOffers: [],
            itemsDetailed: []
        };
    }

    const safeItems = cartItems;
    const safeOffers = Array.isArray(offers) ? offers : [];
    const totalItems = safeItems.reduce((sum, item) => {
        return sum + Number(item?.quantity || 0);
    }, 0);

    const itemsDetailedBase = safeItems.map((item) => {
        const safePrice = Math.max(0, Number(item?.priceSnapshot ?? 0));
        const safeQty = Math.max(0, Number(item?.quantity ?? 0));
        const product = {
            _id: item?.productId || null,
            categoryId: item?.categoryId || null,
            brandId: item?.brandId || null,
            priceSnapshot: safePrice
        };
        const selectedOfferId = item?.selectedOfferId ? String(item.selectedOfferId) : '';
        const hasContext =
            Boolean(product._id)
            || Boolean(product.categoryId)
            || Boolean(product.brandId);
        const applicableOffers = (hasContext && safeOffers.length > 0)
            ? getApplicableOffers(product, safeOffers)
            : [];
        const selectedOffer = selectedOfferId
            ? applicableOffers.find((offer) => String(offer?._id || '') === selectedOfferId)
            : null;
        const bestOffer = selectedOffer
            ? {
                offerId: selectedOffer._id || null,
                offerName: selectedOffer.name || '',
                offerType: selectedOffer.type || '',
                discountAmount: calculateOfferDiscount(safePrice, selectedOffer),
                finalPriceAfterOffer: roundCurrency(
                    Math.max(0, safePrice - calculateOfferDiscount(safePrice, selectedOffer))
                )
            }
            : (applicableOffers.length > 0 ? getBestOffer(product, applicableOffers) : null);
        const offerDiscountPerUnit = roundCurrency(
            Math.max(0, Number(bestOffer?.discountAmount ?? 0))
        );
        const finalUnitPrice = roundCurrency(Math.max(0, safePrice - offerDiscountPerUnit));
        const rawSubtotal = finalUnitPrice * safeQty;
        const subtotalAfterOffer = roundCurrency(rawSubtotal);
        const offerDiscountTotal = roundCurrency(offerDiscountPerUnit * safeQty);

        return {
            productId: item?.productId || null,
            categoryId: item?.categoryId || null,
            brandId: item?.brandId || null,
            selectedOfferId: item?.selectedOfferId || null,
            priceSnapshot: safePrice,
            quantity: safeQty,
            offerDiscountPerUnit,
            finalUnitPrice,
            itemSubtotal: subtotalAfterOffer,
            offerDiscountTotal,
            subtotalAfterOffer
        };
    });
    const itemsWithOffers = itemsDetailedBase.map((item) => ({
        productId: item.productId,
        categoryId: item.categoryId,
        brandId: item.brandId,
        selectedOfferId: item.selectedOfferId,
        priceSnapshot: item.priceSnapshot,
        quantity: item.quantity,
        offerDiscountPerUnit: item.offerDiscountPerUnit,
        finalUnitPrice: item.finalUnitPrice,
        itemSubtotal: item.itemSubtotal
    }));

    const subtotal = roundCurrency(itemsDetailedBase.reduce((sum, item) => {
        return sum + Number(item?.subtotalAfterOffer ?? 0);
    }, 0));
    const offerDiscountTotal = roundCurrency(itemsDetailedBase.reduce((sum, item) => {
        return sum + Number(item?.offerDiscountTotal ?? 0);
    }, 0));
    let couponDiscount = 0;
    let couponApplied = false;
    let couponValidationReason = '';

    if (coupon && typeof coupon === 'object') {
        try {
            const validation = await validateCoupon(coupon, userId, subtotal);

            if (validation.valid) {
                couponDiscount = calculateCouponDiscount(subtotal, coupon);
                couponApplied = true;
            } else {
                couponValidationReason = validation.reason || 'INVALID_COUPON';
            }
        } catch (error) {
            console.warn('Failed to validate coupon during pricing calculation', {
                couponId: coupon?._id || null,
                userId: userId || null,
                error: error?.message || error
            });
            couponApplied = false;
            couponDiscount = 0;
            couponValidationReason = 'INVALID_COUPON';
        }
    }

    couponDiscount = roundCurrency(Math.min(Math.max(0, Number(couponDiscount) || 0), subtotal));

    const couponShares = distributeAmountProportionally(
        itemsDetailedBase,
        couponDiscount,
        (item) => item?.subtotalAfterOffer
    );
    const itemsDetailedWithCoupon = itemsDetailedBase.map((item, index) => {
        const couponDiscountShare = roundCurrency(Number(couponShares[index] || 0));
        const finalSubtotal = roundCurrency(
            Math.max(0, Number(item?.subtotalAfterOffer || 0) - couponDiscountShare)
        );

        return {
            ...item,
            couponDiscountShare,
            finalSubtotal
        };
    });
    const discountedSubtotal = roundCurrency(
        itemsDetailedWithCoupon.reduce((sum, item) => sum + Number(item?.finalSubtotal ?? 0), 0)
    );
    const gst = roundCurrency(discountedSubtotal * getGstRate());
    const gstShares = distributeAmountProportionally(
        itemsDetailedWithCoupon,
        gst,
        (item) => item?.finalSubtotal
    );
    let itemsDetailed = itemsDetailedWithCoupon.map((item, index) => {
        const finalSubtotal = Math.max(0, roundCurrency(Number(item?.finalSubtotal || 0)));
        const gstAmount = Math.max(0, roundCurrency(Number(gstShares[index] || 0)));
        const finalPrice = Math.max(0, roundCurrency(finalSubtotal + gstAmount));

        return {
            productId: item.productId,
            categoryId: item.categoryId,
            brandId: item.brandId,
            selectedOfferId: item.selectedOfferId,
            priceSnapshot: item.priceSnapshot,
            quantity: item.quantity,
            offerDiscountPerUnit: item.offerDiscountPerUnit,
            offerDiscountTotal: item.offerDiscountTotal,
            subtotalAfterOffer: item.subtotalAfterOffer,
            couponDiscountShare: item.couponDiscountShare,
            finalSubtotal,
            gstAmount,
            finalPrice
        };
    });
    const gstSum = roundCurrency(itemsDetailed.reduce((sum, item) => {
        return sum + Number(item?.gstAmount ?? 0);
    }, 0));

    if (itemsDetailed.length > 0 && gstSum !== gst) {
        const lastIndex = itemsDetailed.length - 1;
        const gstDiff = roundCurrency(gst - gstSum);
        const updatedLastItemGst = Math.max(0, roundCurrency(Number(itemsDetailed[lastIndex].gstAmount || 0) + gstDiff));
        const updatedLastItemFinalSubtotal = Math.max(0, roundCurrency(Number(itemsDetailed[lastIndex].finalSubtotal || 0)));

        itemsDetailed[lastIndex] = {
            ...itemsDetailed[lastIndex],
            gstAmount: updatedLastItemGst,
            finalPrice: Math.max(0, roundCurrency(updatedLastItemFinalSubtotal + updatedLastItemGst))
        };
    }

    const finalTotal = roundCurrency(itemsDetailed.reduce((sum, item) => {
        return sum + Number(item?.finalPrice ?? 0);
    }, 0));
    const targetFinalTotal = roundCurrency(discountedSubtotal + gst);

    if (itemsDetailed.length > 0 && finalTotal !== targetFinalTotal) {
        const lastIndex = itemsDetailed.length - 1;
        const finalPriceDiff = roundCurrency(targetFinalTotal - finalTotal);
        const updatedLastItemFinalPrice = Math.max(0, roundCurrency(Number(itemsDetailed[lastIndex].finalPrice || 0) + finalPriceDiff));
        const updatedLastItemFinalSubtotal = Math.max(0, roundCurrency(Number(itemsDetailed[lastIndex].finalSubtotal || 0)));

        itemsDetailed[lastIndex] = {
            ...itemsDetailed[lastIndex],
            finalPrice: updatedLastItemFinalPrice,
            gstAmount: Math.max(0, roundCurrency(updatedLastItemFinalPrice - updatedLastItemFinalSubtotal))
        };
    }

    itemsDetailed.forEach((item) => {
        if (
            !Number.isFinite(Number(item?.finalSubtotal))
            || !Number.isFinite(Number(item?.gstAmount))
            || !Number.isFinite(Number(item?.finalPrice))
            || Number(item.finalSubtotal) < 0
            || Number(item.gstAmount) < 0
            || Number(item.finalPrice) < 0
        ) {
            throw new Error('Invalid item pricing computed');
        }
    });

    const normalizedFinalTotal = roundCurrency(itemsDetailed.reduce((sum, item) => {
        return sum + Number(item?.finalPrice ?? 0);
    }, 0));

    return {
        totalItems,
        subtotal,
        gst,
        finalTotal: normalizedFinalTotal,
        offerDiscountTotal,
        couponDiscount,
        discountedSubtotal,
        couponApplied,
        couponValidationReason,
        itemsWithOffers,
        itemsDetailed
    };
};

module.exports = {
    calculatePricing
};
