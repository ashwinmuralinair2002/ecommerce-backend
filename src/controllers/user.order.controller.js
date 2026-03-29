const userOrderService = require('../services/user.order.service');

const getUserOrdersPage = async (req, res, next) => {
    try {
        const {
            search = '',
            sort = 'newest',
            date = '',
            paymentMethod = '',
            page = '1'
        } = req.query;
        const {
            orders,
            totalOrders,
            currentPage,
            totalPages
        } = await userOrderService.getUserOrders(req.session.userId, {
            search,
            sort,
            dateFilter: date,
            paymentMethod,
            page: Math.max(parseInt(page, 10) || 1, 1),
            limit: 10
        });

        return res.render('user/orders', {
            orders,
            totalOrders,
            currentPage,
            totalPages,
            search,
            sort,
            date,
            paymentMethod,
            query: {
                ...req.query,
                search,
                sort,
                date,
                paymentMethod,
                page: String(currentPage)
            }
        });
    } catch (error) {
        return next(error);
    }
};

const getUserOrderDetailsPage = async (req, res, next) => {
    try {
        const order = await userOrderService.getUserOrderById(
            req.session.userId,
            req.params.orderId
        );

        if (!order) {
            return res.redirect('/orders');
        }

        return res.render('user/order-details', { order });
    } catch (error) {
        return next(error);
    }
};

module.exports = {
    getUserOrdersPage,
    getUserOrderDetailsPage
};
