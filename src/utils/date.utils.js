const AppError = require('./AppError');

function normalizeAdminDateInput(value) {
    if (!value) return '';

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return value;
    }

    const parts = String(value).split('/');

    if (parts.length === 3) {
        const [day, month, year] = parts;
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    return String(value);
}

function normalizeDateToUTC(dateString, isEnd = false) {
    if (!dateString) return null;

    const date = new Date(dateString);

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    if (isEnd) {
        date.setHours(23, 59, 59, 999);
    } else {
        date.setHours(0, 0, 0, 0);
    }

    return new Date(date.toISOString());
}

function getISTDateParts(value = new Date()) {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });

    const parts = formatter.formatToParts(value).reduce((acc, part) => {
        if (part.type !== 'literal') {
            acc[part.type] = Number(part.value);
        }

        return acc;
    }, {});

    return {
        year: Number(parts.year || 1970),
        month: Number(parts.month || 1),
        day: Number(parts.day || 1)
    };
}

function createISTMidnightUTCDate({ year, month, day }) {
    const IST_OFFSET_MINUTES = 330;

    return new Date(Date.UTC(year, month - 1, day, 0, -IST_OFFSET_MINUTES, 0, 0));
}

function getCustomDateRange(startDate, endDate) {
    if (!startDate || !endDate) {
        throw new AppError('Start date and end date required', 400);
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        throw new AppError('Invalid start date or end date', 400);
    }

    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    if (start > end) {
        throw new AppError('End date must be on or after start date', 400);
    }

    return {
        startDate: start,
        endDate: end
    };
}

function getReportDateRange(range = 'daily', customStartDate, customEndDate) {
    if (range === 'custom') {
        return getCustomDateRange(customStartDate, customEndDate);
    }

    const now = new Date();
    const resolvedEndDate = new Date(now);
    const istNowParts = getISTDateParts(now);
    const rangeAnchor = new Date(Date.UTC(
        istNowParts.year,
        istNowParts.month - 1,
        istNowParts.day,
        0,
        0,
        0,
        0
    ));
    let resolvedStartDate;

    switch (range) {
        case 'daily':
            break;
        case 'weekly':
            rangeAnchor.setUTCDate(rangeAnchor.getUTCDate() - 7);
            break;
        case 'monthly':
            rangeAnchor.setUTCMonth(rangeAnchor.getUTCMonth() - 1);
            break;
        case 'yearly':
            rangeAnchor.setUTCFullYear(rangeAnchor.getUTCFullYear() - 1);
            break;
        default:
            resolvedStartDate = new Date(0);
    }

    if (!resolvedStartDate) {
        resolvedStartDate = createISTMidnightUTCDate({
            year: rangeAnchor.getUTCFullYear(),
            month: rangeAnchor.getUTCMonth() + 1,
            day: rangeAnchor.getUTCDate()
        });
    }

    return { startDate: resolvedStartDate, endDate: resolvedEndDate };
}

function getAnalyticsDateRange(query = {}, options = {}) {
    const {
        defaultRange = 'all',
        includeUpperBound = true
    } = options;
    const requestedRange = String(query.range || defaultRange).toLowerCase();

    if (requestedRange === 'custom') {
        const customRange = getCustomDateRange(query.startDate, query.endDate);

        return {
            range: 'custom',
            startDate: customRange.startDate,
            endDate: customRange.endDate,
            createdAt: {
                $gte: customRange.startDate,
                $lte: customRange.endDate
            }
        };
    }

    if (!['daily', 'weekly', 'monthly', 'yearly'].includes(requestedRange)) {
        return {
            range: 'all',
            startDate: new Date(0),
            endDate: new Date(),
            createdAt: null
        };
    }

    const { startDate: resolvedStartDate, endDate: resolvedEndDate } = getReportDateRange(requestedRange);
    const createdAt = {
        $gte: resolvedStartDate
    };

    if (includeUpperBound) {
        createdAt.$lte = resolvedEndDate;
    }

    return {
        range: requestedRange,
        startDate: resolvedStartDate,
        endDate: resolvedEndDate,
        createdAt
    };
}

function buildDailyBuckets(startDate, endDate) {
    const buckets = [];
    const cursor = new Date(startDate);

    cursor.setHours(0, 0, 0, 0);

    while (cursor <= endDate) {
        buckets.push({
            date: cursor.toISOString().split('T')[0],
            revenue: 0
        });
        cursor.setDate(cursor.getDate() + 1);
    }

    return buckets;
}

module.exports = {
    normalizeAdminDateInput,
    normalizeDateToUTC,
    getISTDateParts,
    createISTMidnightUTCDate,
    getCustomDateRange,
    getReportDateRange,
    getAnalyticsDateRange,
    buildDailyBuckets
};
