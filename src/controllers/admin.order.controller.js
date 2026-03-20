const adminOrderService = require('../services/admin.order.service');

const getOrders = async (req, res) => {
    try {
        const { search, status, sort, payment, price, page } = req.query;
        const data = await adminOrderService.getAllOrders({ search, status, sort, payment, price, page });

        return res.json({
            success: true,
            data
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

const renderOrdersPage = async (req, res) => {
    try {
        const { search, status, sort, payment, price } = req.query;
        const page = parseInt(req.query.page, 10) || 1;
        const { orders, totalOrders, currentPage, totalPages } = await adminOrderService.getAllOrders({
            search,
            status,
            sort,
            payment,
            price,
            page
        });

        return res.render('admin/admin-orders', {
            orders,
            currentPage,
            totalPages,
            totalOrders,
            filters: {
                search: search || '',
                status: status || '',
                sort: sort || 'newest',
                payment: payment || '',
                price: price || ''
            }
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

const renderOrderDetailsPage = async (req, res) => {
    try {
        const order = await adminOrderService.getOrderById(req.params.orderId);

        return res.render('admin/admin-order-details', {
            order
        });
    } catch (error) {
        const statusCode = error.message === 'Order not found' ? 404 : 400;

        return res.status(statusCode).json({
            success: false,
            message: error.message
        });
    }
};

const getOrderDetails = async (req, res) => {
    try {
        const order = await adminOrderService.getOrderById(req.params.orderId);

        return res.json({
            success: true,
            data: order
        });
    } catch (error) {
        const statusCode = error.message === 'Order not found' ? 404 : 400;

        return res.status(statusCode).json({
            success: false,
            message: error.message
        });
    }
};

const updateStatus = async (req, res) => {
    try {
        const updatedOrder = await adminOrderService.updateOrderStatus(
            req.params.orderId,
            req.body.status || req.body.newStatus
        );

        return res.json({
            success: true,
            data: updatedOrder
        });
    } catch (error) {
        const statusCode = error.message === 'Order not found' ? 404 : 400;

        return res.status(statusCode).json({
            success: false,
            message: error.message
        });
    }
};

const bulkUpdateStatus = async (req, res) => {
    try {
        const result = await adminOrderService.bulkUpdateOrderStatus(
            req.body.orderIds,
            req.body.status
        );

        return res.json({
            success: true,
            updatedCount: result.updatedCount,
            skippedCount: result.skippedCount
        });
    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

const processReturn = async (req, res) => {
    try {
        const result = await adminOrderService.processReturn(
            req.params.orderId,
            req.params.itemId,
            req.body.action
        );

        return res.json(result);
    } catch (error) {
        const statusCode = error.message === 'Order not found' ? 404 : 400;

        return res.status(statusCode).json({
            success: false,
            message: error.message
        });
    }
};

const updateItemStatus = async (req, res) => {
    try {
        const result = await adminOrderService.processItemStatusUpdate(
            req.params.orderId,
            req.params.itemId,
            req.body.status
        );

        return res.json(result);
    } catch (error) {
        const statusCode = error.message === 'Order not found' ? 404 : 400;

        return res.status(statusCode).json({
            success: false,
            message: error.message
        });
    }
};

module.exports = {
    getOrders,
    renderOrdersPage,
    renderOrderDetailsPage,
    getOrderDetails,
    updateStatus,
    bulkUpdateStatus,
    processReturn,
    updateItemStatus
};
