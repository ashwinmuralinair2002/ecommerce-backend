function asArray(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (typeof value === 'string' && value.trim()) return [value.trim()];
    return [];
}

function asQueryArray(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (typeof value === 'string' && value.trim()) return [value.trim()];
    return [];
}

function normalizeToArray(val) {
    if (!val) return [];
    return Array.isArray(val) ? val : [val];
}

function asSingleQueryValue(value) {
    const values = asQueryArray(value);
    return values.length > 0 ? values[0] : null;
}

function normalizeSelectionArray(value) {
    if (value == null || value === '') {
        return [];
    }

    return Array.isArray(value) ? value : [value];
}

module.exports = {
    asArray,
    asQueryArray,
    normalizeToArray,
    asSingleQueryValue,
    normalizeSelectionArray
};
