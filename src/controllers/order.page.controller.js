const Order = require('../models/order.model');

const getOrderSuccessPage = async (req, res, next) => {
    const { orderId } = req.query;

    if (!orderId) {
        return res.redirect('/home');
    }

    try {
        const order = await Order.findOne({ orderId }).lean();

        if (!order) {
            return res.redirect('/home');
        }

        return res.render('user/order-success', { order });
    } catch (error) {
        return next(error);
    }
};

module.exports = {
    getOrderSuccessPage
};
