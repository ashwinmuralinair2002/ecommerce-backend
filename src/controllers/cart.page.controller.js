const cartService = require('../services/cart.service');

const getCartPage = async (req, res, next) => {
    const userId = req.session.userId;

    try {
        const cart = await cartService.getCart(userId);
        res.render('user/cart', { cart });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getCartPage
};
