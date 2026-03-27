const cartService = require('../services/cart.service');

const addToCart = async (req, res) => {
    const userId = req.session.userId;
    const { productId, variantId, quantity } = req.body;

    try {
        const cart = await cartService.addToCart(userId, productId, variantId, Number(quantity));
        res.json({
            success: true,
            data: cart
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

const getCart = async (req, res) => {
    const userId = req.session.userId;

    try {
        const cart = await cartService.getCart(userId);
        res.json({
            success: true,
            data: cart
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

const updateQuantity = async (req, res) => {
    const userId = req.session.userId;
    const { productId, variantId, quantity } = req.body;

    try {
        const cart = await cartService.updateCartItemQuantity(userId, productId, variantId, quantity);
        res.json({
            success: true,
            data: cart
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

const removeItem = async (req, res) => {
    const userId = req.session.userId;
    const { productId, variantId } = req.body;

    try {
        const cart = await cartService.removeCartItem(userId, productId, variantId);
        res.json({
            success: true,
            data: cart
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

module.exports = {
    addToCart,
    getCart,
    updateQuantity,
    removeItem
};
