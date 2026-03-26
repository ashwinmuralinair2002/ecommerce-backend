function getBaseProductPrice(product) {
    if (!product || typeof product !== 'object') {
        return 0;
    }

    // safely parse values; fallback to 0 if missing, null, or un-parseable
    const price = Number(product.price) || 0;
    let discount = Number(product.discountPercentage) || 0;

    // Enforce logical constraints to prevent calculation bugs
    const safePrice = Math.max(0, price);
    
    if (discount < 0) {
        discount = 0;
    } else if (discount > 100) {
        discount = 100; // prevent discount from yielding negative final price
    }

    const finalPrice = safePrice - (safePrice * discount / 100);

    // Final safety wrap to guarantee a valid, non-negative number is returned
    return Number.isFinite(finalPrice) ? Math.max(0, finalPrice) : 0;
}

module.exports = {
    getBaseProductPrice
};
