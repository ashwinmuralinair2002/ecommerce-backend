const checkoutService = require('../services/checkout.service');

const getCheckoutPage = async (req, res, next) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }

    const userId = req.session.userId;

    try {
        const checkoutData = await checkoutService.prepareCheckout(userId);

        res.render('user/checkout', {
            checkout: checkoutData
        });
    } catch (error) {
        if (
            error.message === 'Cart is empty' ||
            error.message === 'Invalid cart items present' ||
            error.message === 'No delivery address selected'
        ) {
            return res.redirect(`/cart?error=${encodeURIComponent(error.message || 'checkout')}`);
        }

        return next(error);
    }
};

module.exports = {
    getCheckoutPage
};
