function toTitleCase(s) {
    return s.trim().replace(/\s+/g, ' ').replace(/\b[a-z]/g, c => c.toUpperCase());
}

function slugify(value) {
    return String(value || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
}

function formatDateForInput(value) {
    if (!value) return '';
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return '';
    }

    return date.toISOString().split('T')[0];
}

function formatReportCurrency(value) {
    return `Rs. ${Number(value || 0).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
}

function formatReportStatusLabel(status) {
    return String(status || 'unknown')
        .split('_')
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function formatReportDate(value) {
    if (!value) {
        return 'N/A';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return 'N/A';
    }

    return date.toISOString().split('T')[0];
}

function formatReportHeaderDate(value) {
    if (!value) {
        return 'N/A';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return 'N/A';
    }

    return date.toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
}

function normalizeReportPaymentMethod(paymentMethod) {
    if (paymentMethod === 'COD') {
        return 'Cash on Delivery';
    }

    if (paymentMethod === 'online') {
        return 'Online';
    }

    if (paymentMethod === 'wallet') {
        return 'Wallet';
    }

    return String(paymentMethod || 'N/A');
}

function getStatusColor(status) {
    const normalizedStatus = String(status || '').toLowerCase();

    if (normalizedStatus === 'delivered') {
        return 'green';
    }

    if (['cancelled', 'canceled', 'returned'].includes(normalizedStatus)) {
        return 'red';
    }

    if (normalizedStatus === 'shipped') {
        return 'blue';
    }

    if (['pending', 'processing'].includes(normalizedStatus)) {
        return 'orange';
    }

    return 'black';
}

function getFriendlyError(error, fallbackMessage) {
    if (error && error.name === 'ValidationError') {
        const details = Object.values(error.errors || {}).map((item) => item.message);
        return details[0] || 'Validation failed.';
    }

    return (error && error.message) || fallbackMessage;
}

module.exports = {
    toTitleCase,
    slugify,
    formatDateForInput,
    formatReportCurrency,
    formatReportStatusLabel,
    formatReportDate,
    formatReportHeaderDate,
    normalizeReportPaymentMethod,
    getStatusColor,
    getFriendlyError
};
