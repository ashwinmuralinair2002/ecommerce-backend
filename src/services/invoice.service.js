const PDFDocument = require('pdfkit');
const axios = require('axios');
const Order = require('../models/order.model');
const Product = require('../models/Product');

const formatCurrency = (value) => `Rs. ${Number(value || 0).toLocaleString('en-IN')}`;

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

    const headerY = doc.y;
    doc.fontSize(10).fillColor('#6B7280');
    doc.text('Item', 40, headerY);
    doc.text('Price', 340, headerY, { width: 60, align: 'right' });
    doc.text('Qty', 410, headerY, { width: 40, align: 'right' });
    doc.text('Amount', 470, headerY, { width: 85, align: 'right' });
    doc.moveDown(0.7);
    drawDivider(doc, doc.y);
    doc.moveDown(0.6);

    for (const item of order.items || []) {
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

        doc.fontSize(11).fillColor('#111827').text(item.productName || 'Product', 96, rowTop, { width: 220 });
        doc.fontSize(9).fillColor('#6B7280').text(`Color: ${item.colorName || 'Default'}`, 96, doc.y + 2, { width: 220 });

        doc.fontSize(10).fillColor('#111827').text(formatCurrency(item.price), 340, rowTop, { width: 60, align: 'right' });
        doc.text(String(Number(item.quantity || 0)), 410, rowTop, { width: 40, align: 'right' });
        doc.text(formatCurrency(item.totalPrice), 470, rowTop, { width: 85, align: 'right' });

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
};

module.exports = {
    generateInvoice
};
