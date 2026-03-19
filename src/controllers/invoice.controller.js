const invoiceService = require('../services/invoice.service');

const downloadInvoice = async (req, res) => {
    try {
        const { orderId } = req.params;
        const userId = req.user && req.user._id;

        await invoiceService.generateInvoice(orderId, userId, res);
    } catch (err) {
        if (!res.headersSent) {
            res.status(err.message === 'Order not found' ? 404 : 500).send('Unable to generate invoice');
        }
    }
};

module.exports = {
    downloadInvoice
};
