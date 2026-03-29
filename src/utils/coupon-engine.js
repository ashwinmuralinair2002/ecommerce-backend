const CouponUsage = require('../models/coupon-usage.model');

const roundCurrency = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const toSafeNumber = (value, fallback = 0) => {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
        return fallback;
    }

    return numericValue;
};

const toValidDate = (value) => {
    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return date;
};

const normalizeId = (value) => {
    if (value == null) {
        return '';
    }

    return String(value);
};

const getPerUserUsageCount = (coupon, userId) => {
    const safeUserId = normalizeId(userId);

    if (!safeUserId || !coupon || typeof coupon !== 'object') {
        return 0;
    }

    const directCount = toSafeNumber(coupon.userUsageCount, null);

    if (directCount !== null) {
        return Math.max(0, directCount);
    }

    const usageByUser = coupon.usageByUser;

    if (usageByUser instanceof Map) {
        return Math.max(0, toSafeNumber(usageByUser.get(safeUserId), 0));
    }

    if (usageByUser && typeof usageByUser === 'object' && !Array.isArray(usageByUser)) {
        return Math.max(0, toSafeNumber(usageByUser[safeUserId], 0));
    }

    if (Array.isArray(coupon.usageHistory)) {
        const usageCount = coupon.usageHistory.reduce((count, entry) => {
            if (!entry || normalizeId(entry.userId) !== safeUserId) {
                return count;
            }

            const entryCount = toSafeNumber(entry.count, 1);

            return count + Math.max(0, entryCount);
        }, 0);

        return Math.max(0, usageCount);
    }

    return 0;
};

const validateCoupon = async (coupon, userId, subtotal) => {
    if (!coupon) {
        return { valid: false, reason: 'COUPON_NOT_FOUND' };
    }

    const safeSubtotal = Math.max(0, toSafeNumber(subtotal, 0));
    const currentDate = new Date();

    if (typeof coupon !== 'object') {
        return { valid: false, reason: 'INVALID_COUPON' };
    }

    const startDate = toValidDate(coupon.startDate);
    const endDate = toValidDate(coupon.endDate);

    if (!coupon.isActive || coupon.isDeleted) {
        return { valid: false, reason: 'COUPON_INACTIVE' };
    }

    if (!startDate || !endDate) {
        return { valid: false, reason: 'INVALID_COUPON' };
    }

    if (currentDate < startDate) {
        return { valid: false, reason: 'COUPON_NOT_STARTED' };
    }

    if (currentDate > endDate) {
        return { valid: false, reason: 'COUPON_EXPIRED' };
    }

    const minOrderValue = Math.max(0, toSafeNumber(coupon.minOrderValue, 0));

    if (safeSubtotal < minOrderValue) {
        return { valid: false, reason: 'MIN_ORDER_NOT_MET' };
    }

    const usageLimit = toSafeNumber(coupon.usageLimit, null);
    const usedCount = Math.max(0, toSafeNumber(coupon.usedCount, 0));

    if (usageLimit !== null && usageLimit > 0 && usedCount >= usageLimit) {
        return { valid: false, reason: 'USAGE_LIMIT_EXCEEDED' };
    }

    const usagePerUser = toSafeNumber(coupon.usagePerUser, null);

    if (usagePerUser !== null && usagePerUser > 0 && userId) {
        try {
            const userUsageCount = await CouponUsage.countDocuments({
                couponId: coupon._id,
                userId
            });

            if (userUsageCount >= usagePerUser) {
                return { valid: false, reason: 'USER_LIMIT_EXCEEDED' };
            }
        } catch (error) {
            console.warn('Failed to validate coupon per-user usage', {
                couponId: coupon?._id || null,
                userId: userId || null,
                error: error?.message || error
            });

            return { valid: false, reason: 'INVALID_COUPON' };
        }
    }

    return { valid: true, reason: '' };
};

const calculateCouponDiscount = (subtotal, coupon) => {
    if (!coupon || !Number.isFinite(Number(subtotal))) {
        return 0;
    }

    const safeSubtotal = Math.max(0, toSafeNumber(subtotal, 0));

    if (!safeSubtotal || typeof coupon !== 'object') {
        return 0;
    }

    const discountValue = toSafeNumber(coupon.discountValue, 0);

    if (discountValue <= 0) {
        return 0;
    }

    let discount = 0;

    if (coupon.discountType === 'PERCENTAGE') {
        discount = safeSubtotal * (discountValue / 100);
        const maxDiscount = toSafeNumber(coupon.maxDiscount, null);

        if (maxDiscount !== null && maxDiscount > 0) {
            discount = Math.min(discount, maxDiscount);
        }
    }

    if (coupon.discountType === 'FLAT') {
        discount = discountValue;
    }

    if (!Number.isFinite(discount) || discount <= 0) {
        return 0;
    }

    return roundCurrency(Math.min(Math.max(0, discount), safeSubtotal));
};

module.exports = {
    validateCoupon,
    calculateCouponDiscount
};
