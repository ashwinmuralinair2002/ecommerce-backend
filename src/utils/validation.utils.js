function escapeRegex(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeHexColor(input) {
    if (!input) return '';
    const value = String(input).trim().toUpperCase();
    if (/^#?[0-9A-F]{6}$/.test(value)) {
        return value.startsWith('#') ? value : `#${value}`;
    }
    return '';
}

function parseBooleanLike(value) {
    return value === true || value === 'true' || value === 'on' || value === '1';
}

function getArrayEnumValues(pathName) {
    const Product = require('../models/Product');
    const schemaPath = Product.schema.path(pathName);
    if (!schemaPath) return [];

    const enumSource =
        schemaPath.embeddedSchemaType?.enumValues ||
        schemaPath.caster?.enumValues;

    return Array.isArray(enumSource)
        ? enumSource.filter(Boolean)
        : [];
}

function getSingleEnumValues(pathName) {
    const Product = require('../models/Product');
    const schemaPath = Product.schema.path(pathName);
    return schemaPath && Array.isArray(schemaPath.enumValues)
        ? schemaPath.enumValues.filter(Boolean)
        : [];
}

function roundCurrency(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function parseBoolean(value, defaultValue = false) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
        if (['false', '0', 'no', 'off'].includes(normalized)) return false;
    }
    return defaultValue;
}

function parseOrder(value, defaultValue = 0) {
    if (value === undefined || value === null || value === '') return defaultValue;
    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
        const error = new Error('Order must be a valid number.');
        error.statusCode = 400;
        throw error;
    }
    return parsed;
}

function mapIssuesToFields(issues = []) {
    return issues.reduce((acc, issue) => {
        const fieldName = Array.isArray(issue.path) && issue.path.length > 0 ? issue.path[0] : 'form';

        if (!acc[fieldName]) {
            acc[fieldName] = issue.message;
        }

        return acc;
    }, {});
}

module.exports = {
    escapeRegex,
    normalizeHexColor,
    parseBooleanLike,
    getArrayEnumValues,
    getSingleEnumValues,
    roundCurrency,
    parseBoolean,
    parseOrder,
    mapIssuesToFields
};
