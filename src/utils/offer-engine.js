const roundCurrency = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const normalizeId = (value) => {
    if (value == null) {
        return '';
    }

    return String(value);
};

const toValidDate = (value) => {
    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return date;
};

const isOfferCurrentlyActive = (offer, currentDate = new Date()) => {
    const startDate = toValidDate(offer?.startDate);
    const endDate = toValidDate(offer?.endDate);

    if (!offer?.isActive || offer?.isDeleted || !startDate || !endDate) {
        return false;
    }

    return currentDate >= startDate && currentDate <= endDate;
};

const doesOfferMatchProduct = (product, offer) => {
    const productId = normalizeId(product?._id);
    const categoryId = normalizeId(product?.categoryId);
    const brandId = normalizeId(product?.brandId);
    const applicableProducts = Array.isArray(offer?.applicableProducts) ? offer.applicableProducts : [];
    const applicableCategories = Array.isArray(offer?.applicableCategories) ? offer.applicableCategories : [];
    const applicableBrands = Array.isArray(offer?.applicableBrands) ? offer.applicableBrands : [];

    if (offer.type === 'PRODUCT') {
        return productId && applicableProducts.some((id) => String(id) === productId);
    }

    if (offer.type === 'CATEGORY') {
        return categoryId && applicableCategories.some((id) => String(id) === categoryId);
    }

    if (offer.type === 'BRAND') {
        return brandId && applicableBrands.some((id) => String(id) === brandId);
    }

    return false;
};

const getApplicableOffers = (product, offers = []) => {
    if (!product || !product._id || !Array.isArray(offers)) {
        return [];
    }

    const currentDate = new Date();
    const safeProduct = {
        _id: product._id,
        categoryId: product.categoryId,
        brandId: product.brandId,
        priceSnapshot: Number(product.priceSnapshot ?? 0)
    };

    return offers.filter((offer) => {
        if (!offer || typeof offer !== 'object') {
            return false;
        }

        if (!isOfferCurrentlyActive(offer, currentDate)) {
            return false;
        }

        if (!offer.type || !offer.discountType || !Number.isFinite(Number(offer.discountValue))) {
            return false;
        }

        return doesOfferMatchProduct(safeProduct, offer);
    });
};

const calculateOfferDiscount = (productPrice, offer) => {
    const safePrice = Math.max(0, Number(productPrice ?? 0));

    if (!safePrice || !offer || typeof offer !== 'object') {
        return 0;
    }

    const minOrderValue = Math.max(0, Number(offer.minOrderValue ?? 0));

    if (minOrderValue > 0 && safePrice < minOrderValue) {
        return 0;
    }

    const discountValue = Number(offer.discountValue);

    if (!Number.isFinite(discountValue) || discountValue <= 0) {
        return 0;
    }

    let discount = 0;

    if (offer.discountType === 'PERCENTAGE') {
        discount = safePrice * (discountValue / 100);
    }

    if (offer.discountType === 'FLAT') {
        discount = discountValue;
    }

    if (offer.discountType === 'PERCENTAGE') {
        const maxDiscountAmount = Number(
            offer.maxDiscountAmount != null
                ? offer.maxDiscountAmount
                : offer.maxDiscount
        );

        if (Number.isFinite(maxDiscountAmount) && maxDiscountAmount > 0) {
            discount = Math.min(discount, maxDiscountAmount);
        }
    }

    if (!Number.isFinite(discount) || discount <= 0) {
        return 0;
    }

    return roundCurrency(Math.min(discount, safePrice));
};

const getBestOffer = (product, offers = []) => {
    if (!product || !product._id) {
        return null;
    }

    const safePrice = Math.max(0, Number(product.priceSnapshot ?? 0));

    if (!Number.isFinite(safePrice)) {
        return null;
    }

    const applicableOffers = getApplicableOffers(product, offers);

    if (!applicableOffers.length) {
        return null;
    }

    const bestOffer = applicableOffers.reduce((best, offer) => {
        const currentDiscount = calculateOfferDiscount(safePrice, offer);

        if (!best || currentDiscount > best.discountAmount) {
            const finalPriceAfterOffer = roundCurrency(Math.max(0, safePrice - currentDiscount));

            return {
                offerId: offer._id || null,
                offerName: offer.name || '',
                offerType: offer.type || '',
                discountAmount: currentDiscount,
                finalPriceAfterOffer: Number.isFinite(finalPriceAfterOffer) ? finalPriceAfterOffer : 0
            };
        }

        return best;
    }, null);

    return bestOffer;
};

module.exports = {
    getApplicableOffers,
    calculateOfferDiscount,
    getBestOffer
};
