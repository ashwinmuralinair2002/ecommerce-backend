let cachedOffers = null;
let lastFetchTime = 0;

const CACHE_TTL = 60 * 1000;

const getCachedOffers = async (OfferModel) => {
    const now = Date.now();

    if (cachedOffers && (now - lastFetchTime < CACHE_TTL)) {
        return cachedOffers;
    }

    try {
        const currentDate = new Date();
        const offers = await OfferModel.find({
            isActive: true,
            isDeleted: false,
            startDate: { $lte: currentDate },
            endDate: { $gte: currentDate }
        }).lean();

        cachedOffers = Array.isArray(offers) ? offers : [];
        lastFetchTime = now;

        return cachedOffers;
    } catch (error) {
        return [];
    }
};

const clearOfferCache = () => {
    cachedOffers = null;
    lastFetchTime = 0;
};

module.exports = {
    getCachedOffers,
    clearOfferCache
};
