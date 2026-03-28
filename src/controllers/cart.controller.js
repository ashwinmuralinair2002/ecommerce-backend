const Cart = require('../models/cart.model');
const cartService = require('../services/cart.service');

const addToCart = async (req, res) => {
    const userId = req.session.userId;
    const { productId, variantId, quantity, selectedOfferId } = req.body;

    try {
        const cart = await cartService.addToCart(userId, productId, variantId, Number(quantity), req, selectedOfferId);
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
    const { productId, variantId, quantity, selectedOfferId } = req.body;

    try {
        const cart = await cartService.updateCartItemQuantity(userId, productId, variantId, quantity, req, selectedOfferId);
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
    const { productId, variantId, selectedOfferId } = req.body;

    try {
        const cart = await cartService.removeCartItem(userId, productId, variantId, req, selectedOfferId);
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

const buyNow = async (req, res) => {
    const userId = req.session.userId;
    const { productId, variantId, quantity, selectedOfferId } = req.body;

    try {
        await Cart.findOneAndUpdate(
            { userId },
            { $set: { items: [] } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        await cartService.addToCart(userId, productId, variantId, Number(quantity), req, selectedOfferId);

        res.json({
            success: true
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
    removeItem,
    buyNow
};
