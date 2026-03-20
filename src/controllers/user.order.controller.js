const userOrderService = require('../services/user.order.service');

const getUserOrdersPage = async (req, res, next) => {
    try {
        const {
            search = '',
            sort = 'newest',
            date = ''
        } = req.query;
        const orders = await userOrderService.getUserOrders(req.session.userId, {
            search,
            sort,
            dateFilter: date
        });

        return res.render('user/orders', {
            orders,
            search,
            sort,
            date
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
