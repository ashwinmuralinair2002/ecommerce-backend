const PDFDocument = require('pdfkit');
const axios = require('axios');
const Order = require('../models/order.model');
const AppError = require('../utils/AppError');

const formatCurrency = (value) => `Rs. ${Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
})}`;
const formatStatusLabel = (status) => String(status || 'pending')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
const formatPaymentMethodLabel = (paymentMethod) => {
    if (paymentMethod === 'wallet') {
        return 'Wallet';
    }

    if (paymentMethod === 'online') {
        return 'Online (UPI)';
    }

    if (paymentMethod === 'COD') {
        return 'Cash on Delivery';
    }

    return 'N/A';
};

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
        const offerDiscountTotal = Number(pricing.offerDiscountTotal || order.offerDiscountTotal || 0);
        const couponDiscount = Number(pricing.couponDiscount || order.couponDiscount || 0);
        const taxableValue = Number(pricing.discountedSubtotal || pricing.subtotal || 0);
        const grandTotal = Number(pricing.finalTotal || order.totalAmount || 0);
        const totalSavings = offerDiscountTotal + couponDiscount;
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
                basePrice: Number(item.priceSnapshot || item.price || 0),
                offerDiscount: Number(item.offerDiscount || 0),
                finalPrice: Number(item.finalPrice || item.priceSnapshot || item.price || 0),
                quantity: Number(item.quantity || 0),
                total: Number(item.finalPrice || item.totalPrice || item.priceSnapshot || item.price || 0),
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
            ensurePageSpace(doc, 112);

            const rowTop = doc.y;
            const imageBuffer = await fetchImageBuffer(item.imageUrl);

            if (imageBuffer) {
                try {
                    doc.image(imageBuffer, 40, rowTop, { fit: [44, 44], align: 'center', valign: 'center' });
                } catch (error) {
                    // Ignore invalid image content and continue invoice generation.
                }
            }

            doc.fontSize(11).fillColor('#111827').text(item.name, 96, rowTop, { width: 170 });
            doc.fontSize(9).fillColor('#6B7280').text(`Color: ${item.colorName}`, 96, doc.y + 2, { width: 170 });
            doc.text(`Base: ${formatCurrency(item.basePrice)}`, 96, doc.y + 2, { width: 170 });

            if (item.offerDiscount > 0) {
                doc.fillColor('#16A34A').text(`Offer Discount: -${formatCurrency(item.offerDiscount)}`, 96, doc.y + 2, { width: 170 });
            }

            doc.fillColor('#111827').text(`Final: ${formatCurrency(item.finalPrice)}`, 96, doc.y + 2, { width: 170 });

            doc.fontSize(10).fillColor('#111827').text(formatCurrency(item.basePrice), 290, rowTop, { width: 60, align: 'right' });
            doc.text(String(item.quantity), 360, rowTop, { width: 35, align: 'right' });
            doc.text(formatCurrency(item.total), 405, rowTop, { width: 70, align: 'right' });
            doc.text(formatStatusLabel(item.status), 485, rowTop, { width: 70, align: 'right' });

            doc.y = Math.max(doc.y, rowTop + 86);
            drawDivider(doc, doc.y);
            doc.moveDown(0.6);
        }

        ensurePageSpace(doc, 180);
        doc.moveDown(0.6);
        const summaryTop = doc.y;
        const paymentLabel = formatPaymentMethodLabel(order.paymentMethod);
        doc.fontSize(10).fillColor('#4B5563').text('Payment Method', 360, summaryTop, { width: 100, align: 'right' });
        doc.fontSize(10).fillColor('#111827').text(paymentLabel, 470, summaryTop, { width: 85, align: 'right' });
        doc.fontSize(10).fillColor('#4B5563').text('Subtotal', 360, summaryTop + 18, { width: 100, align: 'right' });
        doc.fontSize(10).fillColor('#111827').text(formatCurrency(pricing.subtotal || 0), 470, summaryTop + 18, { width: 85, align: 'right' });

        let summaryOffset = 36;

        if (offerDiscountTotal > 0) {
            doc.fontSize(10).fillColor('#4B5563').text('Offer Discount', 360, summaryTop + summaryOffset, { width: 100, align: 'right' });
            doc.fontSize(10).fillColor('#16A34A').text(`-${formatCurrency(offerDiscountTotal)}`, 470, summaryTop + summaryOffset, { width: 85, align: 'right' });
            summaryOffset += 18;
        }

        if (couponDiscount > 0) {
            doc.fontSize(10).fillColor('#4B5563').text('Coupon Discount', 360, summaryTop + summaryOffset, { width: 100, align: 'right' });
            doc.fontSize(10).fillColor('#16A34A').text(`-${formatCurrency(couponDiscount)}`, 470, summaryTop + summaryOffset, { width: 85, align: 'right' });
            summaryOffset += 18;

            if (order.coupon?.code) {
                doc.fontSize(9).fillColor('#4B5563').text('Coupon Code', 360, summaryTop + summaryOffset, { width: 100, align: 'right' });
                doc.fontSize(9).fillColor('#111827').text(String(order.coupon.code), 470, summaryTop + summaryOffset, { width: 85, align: 'right' });
                summaryOffset += 18;
            }
        }

        doc.fontSize(10).fillColor('#4B5563').text('Taxable Value', 360, summaryTop + summaryOffset, { width: 100, align: 'right' });
        doc.fontSize(10).fillColor('#111827').text(formatCurrency(taxableValue), 470, summaryTop + summaryOffset, { width: 85, align: 'right' });
        summaryOffset += 18;

        doc.fontSize(10).fillColor('#4B5563').text('GST (18%)', 360, summaryTop + summaryOffset, { width: 100, align: 'right' });
        doc.fontSize(10).fillColor('#111827').text(formatCurrency(pricing.gst || 0), 470, summaryTop + summaryOffset, { width: 85, align: 'right' });
        summaryOffset += 24;

        doc.fontSize(12).fillColor('#111827').text('Grand Total', 360, summaryTop + summaryOffset, { width: 100, align: 'right' });
        doc.fontSize(12).text(formatCurrency(grandTotal), 470, summaryTop + summaryOffset, { width: 85, align: 'right' });
        summaryOffset += 22;

        if (totalSavings > 0) {
            doc.fontSize(9).fillColor('#16A34A').text(`You saved ${formatCurrency(totalSavings)} on this order`, 360, summaryTop + summaryOffset, { width: 195, align: 'right' });
        }

        doc.moveDown(4);
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
