const normalizeStockNumber = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.trunc(parsed));
};

const hasExplicitStockValue = (value) => value !== undefined && value !== null && value !== '';

const resolveTotalStock = (totalStockValue) => {
    if (!hasExplicitStockValue(totalStockValue)) {
        return null;
    }

    return normalizeStockNumber(totalStockValue);
};

const deriveVariantStock = (variant = {}) => {
    const totalStock = resolveTotalStock(variant.totalStock);
    const normalizedCurrentStock = normalizeStockNumber(variant.stockCount);
    const currentStock = totalStock === null
        ? normalizedCurrentStock
        : Math.min(normalizedCurrentStock, totalStock);

    return {
        ...variant,
        stockCount: currentStock,
        totalStock: totalStock === null ? variant.totalStock : totalStock
    };
};

const summarizeVariantStocks = (variants = []) => {
    const normalizedVariants = Array.isArray(variants)
        ? variants.map((variant) => deriveVariantStock(variant))
        : [];

    const stockCount = normalizedVariants.reduce(
        (sum, variant) => sum + normalizeStockNumber(variant.stockCount),
        0
    );
    const explicitVariantTotals = normalizedVariants
        .map((variant) => resolveTotalStock(variant.totalStock));
    const totalStock = explicitVariantTotals.every((variantTotal) => variantTotal !== null)
        ? explicitVariantTotals.reduce((sum, variantTotal) => sum + variantTotal, 0)
        : null;

    return {
        variants: normalizedVariants,
        stockCount,
        totalStock
    };
};

const applyStockSnapshotToProduct = (product) => {
    if (!product) return product;

    const summary = summarizeVariantStocks(product.variants || []);

    if (Array.isArray(product.variants)) {
        product.variants.forEach((variantDoc, index) => {
            const normalizedVariant = summary.variants[index];
            if (!normalizedVariant || !variantDoc) return;
            variantDoc.stockCount = normalizedVariant.stockCount;
        });
    }

    product.stockCount = summary.stockCount;
    if (summary.totalStock !== null) {
        product.totalStock = summary.totalStock;
    } else if (hasExplicitStockValue(product.totalStock)) {
        product.totalStock = normalizeStockNumber(product.totalStock);
    }

    return product;
};

const calculateEditedCurrentStock = ({ existingCurrentStock, existingTotalStock, nextTotalStock }) => {
    const currentStock = normalizeStockNumber(existingCurrentStock);
    const previousTotal = resolveTotalStock(existingTotalStock);
    const totalStock = normalizeStockNumber(nextTotalStock);

    if (previousTotal === null) {
        return Math.min(currentStock, totalStock);
    }

    const adjustedCurrent = currentStock + (totalStock - previousTotal);

    return Math.min(totalStock, Math.max(0, adjustedCurrent));
};

module.exports = {
    hasExplicitStockValue,
    normalizeStockNumber,
    resolveTotalStock,
    deriveVariantStock,
    summarizeVariantStocks,
    applyStockSnapshotToProduct,
    calculateEditedCurrentStock
};
