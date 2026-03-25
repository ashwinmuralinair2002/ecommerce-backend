const PDFDocument = require('pdfkit');
const axios = require('axios');
const Order = require('../models/order.model');
const Product = require('../models/Product');
const AppError = require('../utils/AppError');

const formatCurrency = (value) => `Rs. ${Number(value || 0).toLocaleString('en-IN')}`;
const formatStatusLabel = (status) => String(status || 'pending')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const buildLocationLine = (address = {}) => [address.city, address.state, address.pincode].filter(Boolean).join(', ');

const fetchImageBuffer = async (imageUrl) => {
    if (!imageUrl) {
        return null;
    }

    try {
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 10000 });
        return Buffer.from(response.data);
    } catch (error) {
        return null;
    }
};

const resolveItemImageUrl = async (item) => {
    if (item.imageUrl) {
        return item.imageUrl;
    }

    const product = await Product.findById(item.productId).lean();

    if (!product || !Array.isArray(product.variants) || product.variants.length === 0) {
        return '';
    }

    const variant = product.variants.find((entry) => String(entry._id) === String(item.variantId));

    if (variant && Array.isArray(variant.images) && variant.images.length > 0) {
        return variant.images[0].url || '';
    }

    const firstVariant = product.variants[0];
    if (firstVariant && Array.isArray(firstVariant.images) && firstVariant.images.length > 0) {
        return firstVariant.images[0].url || '';
    }

    return '';
};

const drawDivider = (doc, y) => {
    doc
        .moveTo(40, y)
        .lineTo(555, y)
        .strokeColor('#D1D5DB')
        .lineWidth(1)
        .stroke();
};

const ensurePageSpace = (doc, requiredHeight) => {
    if (doc.y + requiredHeight > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
    }
};

const generateInvoice = async (orderId, userId, res) => {
    try {
        const query = { orderId };

        if (userId) {
            query.user = userId;
        }

        const order = await Order.findOne(query).lean();

        if (!order) {
            throw new Error('Order not found');
        }

        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        const addr = order.shippingAddress || {};
        const pricing = order.pricing || {};
        const orderDate = order.createdAt
            ? new Date(order.createdAt).toLocaleDateString('en-IN')
            : 'N/A';
        const invoiceDate = new Date().toLocaleDateString('en-IN');

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=invoice-${orderId}.pdf`);

        doc.pipe(res);

        doc.fontSize(18).fillColor('#111827').text('Tax Invoice / Bill of Supply / Cash Memo', { align: 'center' });
        doc.moveDown(0.4);
        doc.fontSize(10).fillColor('#4B5563').text('Sold by: SoundWave', { align: 'center' });
        doc.moveDown(1.2);

        doc.fontSize(12).fillColor('#111827').text(`Order ID: ${order.orderId}`);
        doc.text(`Order Date: ${orderDate}`);
        doc.text(`Invoice Date: ${invoiceDate}`);
        doc.moveDown(0.8);

        doc.fontSize(11).fillColor('#111827').text('Shipping Address:', { underline: true });
        doc.fontSize(10).fillColor('#4B5563');
        doc.text(addr.name || '');
        doc.text(addr.phone || '');
        doc.text(addr.addressLine1 || '');
        doc.text(`${addr.city || ''}, ${addr.state || ''} - ${addr.pincode || ''}`);
        doc.moveDown(1.8);

        drawDivider(doc, doc.y);
        doc.moveDown(0.7);

        const lineItems = Array.isArray(order.items)
            ? order.items.map((item) => ({
                name: item.productName || 'Product',
                price: Number(item.price || 0),
                quantity: Number(item.quantity || 0),
                total: Number(item.totalPrice || 0),
                status: item.status || 'pending',
                colorName: item.colorName || 'Default',
                imageUrl: item.imageUrl || '',
                productId: item.productId,
                variantId: item.variantId
            }))
            : [];

        const headerY = doc.y;
        doc.fontSize(10).fillColor('#6B7280');
        doc.text('Item', 40, headerY);
        doc.text('Price', 290, headerY, { width: 60, align: 'right' });
        doc.text('Qty', 360, headerY, { width: 35, align: 'right' });
        doc.text('Amount', 405, headerY, { width: 70, align: 'right' });
        doc.text('Status', 485, headerY, { width: 70, align: 'right' });
        doc.moveDown(0.7);
        drawDivider(doc, doc.y);
        doc.moveDown(0.6);

        for (const item of lineItems) {
            ensurePageSpace(doc, 82);

            const rowTop = doc.y;
            const imageUrl = await resolveItemImageUrl(item);
            const imageBuffer = await fetchImageBuffer(imageUrl);

            if (imageBuffer) {
                try {
                    doc.image(imageBuffer, 40, rowTop, { fit: [44, 44], align: 'center', valign: 'center' });
                } catch (error) {
                    // Ignore invalid image content and continue invoice generation.
                }
            }

            doc.fontSize(11).fillColor('#111827').text(item.name, 96, rowTop, { width: 170 });
            doc.fontSize(9).fillColor('#6B7280').text(`Color: ${item.colorName}`, 96, doc.y + 2, { width: 170 });

            doc.fontSize(10).fillColor('#111827').text(formatCurrency(item.price), 290, rowTop, { width: 60, align: 'right' });
            doc.text(String(item.quantity), 360, rowTop, { width: 35, align: 'right' });
            doc.text(formatCurrency(item.total), 405, rowTop, { width: 70, align: 'right' });
            doc.text(formatStatusLabel(item.status), 485, rowTop, { width: 70, align: 'right' });

            doc.y = Math.max(doc.y, rowTop + 56);
            drawDivider(doc, doc.y);
            doc.moveDown(0.6);
        }

        ensurePageSpace(doc, 120);
        doc.moveDown(0.6);
        const summaryTop = doc.y;
        doc.fontSize(10).fillColor('#4B5563').text('Subtotal', 360, summaryTop, { width: 100, align: 'right' });
        doc.fontSize(10).fillColor('#111827').text(formatCurrency(pricing.subtotal), 470, summaryTop, { width: 85, align: 'right' });
        doc.fontSize(10).fillColor('#4B5563').text('GST', 360, summaryTop + 18, { width: 100, align: 'right' });
        doc.fontSize(10).fillColor('#111827').text(formatCurrency(pricing.gst), 470, summaryTop + 18, { width: 85, align: 'right' });
        doc.fontSize(12).fillColor('#111827').text('Grand Total', 360, summaryTop + 42, { width: 100, align: 'right' });
        doc.fontSize(12).text(formatCurrency(pricing.finalTotal), 470, summaryTop + 42, { width: 85, align: 'right' });

        doc.moveDown(3);
        doc.fontSize(9).fillColor('#6B7280').text('This is a computer-generated invoice.', 40, doc.y);

        doc.end();
    } catch (error) {
        if (res.headersSent) {
            console.error(error);
            return;
        } else {
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError('Invoice generation failed', 500);
        }
    }
};

module.exports = {
    generateInvoice
};
