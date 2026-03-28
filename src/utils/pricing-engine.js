const { getApplicableOffers, getBestOffer, calculateOfferDiscount } = require('./offer-engine');

const GST_RATE = Number(process.env.GST_RATE || 0.18);

// Mirrors the existing rounding behavior currently duplicated in
// cart.service.js, checkout.service.js, buy-now-checkout.js, and order.service.js.
const roundCurrency = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

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
const calculatePricing = (cartItems = [], offers = []) => {
    if (!Array.isArray(cartItems)) {
        console.warn('Invalid cartItems passed to pricing engine');

        return {
            totalItems: 0,
            subtotal: 0,
            gst: 0,
            finalTotal: 0,
            offerDiscountTotal: 0,
            itemsWithOffers: []
        };
    }

    const safeItems = cartItems;
    const safeOffers = Array.isArray(offers) ? offers : [];
    const totalItems = safeItems.reduce((sum, item) => {
        return sum + Number(item?.quantity || 0);
    }, 0);

    const itemsWithOffers = safeItems.map((item) => {
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
        const itemSubtotal = roundCurrency(rawSubtotal);

        return {
            productId: item?.productId || null,
            categoryId: item?.categoryId || null,
            brandId: item?.brandId || null,
            selectedOfferId: item?.selectedOfferId || null,
            priceSnapshot: safePrice,
            quantity: safeQty,
            offerDiscountPerUnit,
            finalUnitPrice,
            itemSubtotal
        };
    });

    const subtotal = roundCurrency(itemsWithOffers.reduce((sum, item) => {
        return sum + Number(item?.itemSubtotal ?? 0);
    }, 0));
    const offerDiscountTotal = roundCurrency(itemsWithOffers.reduce((sum, item) => {
        const discountPerUnit = Math.max(0, Number(item?.offerDiscountPerUnit ?? 0));
        const qty = Math.max(0, Number(item?.quantity ?? 0));

        return sum + (discountPerUnit * qty);
    }, 0));
    const gst = roundCurrency(subtotal * GST_RATE);
    const finalTotal = roundCurrency(subtotal + gst);

    return {
        totalItems,
        subtotal,
        gst,
        finalTotal,
        offerDiscountTotal,
        itemsWithOffers
    };
};

module.exports = {
    calculatePricing
};
