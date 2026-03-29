let cachedCoupons = null;
let lastFetchTime = 0;

const CACHE_TTL = 60 * 1000;

const getCachedCoupons = async (CouponModel) => {
    const now = Date.now();

    if (cachedCoupons && (now - lastFetchTime < CACHE_TTL)) {
        return cachedCoupons;
    }

    try {
        const currentDate = new Date();
        const coupons = await CouponModel.find({
            isActive: true,
            isDeleted: false,
            startDate: { $lte: currentDate },
            endDate: { $gte: currentDate }
        }).lean();

        cachedCoupons = Array.isArray(coupons) ? coupons : [];
        lastFetchTime = now;

        return cachedCoupons;
    } catch (error) {
        return [];
    }
};

const clearCouponCache = () => {
    cachedCoupons = null;
    lastFetchTime = 0;
};

module.exports = {
    getCachedCoupons,
    clearCouponCache
};
