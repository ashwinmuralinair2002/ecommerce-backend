const mongoose = require('mongoose');
const Product = require('../models/Product');
const checkoutService = require('../services/checkout.service');
const walletService = require('../services/wallet.service');
const { buildBuyNowCheckoutData } = require('../utils/buy-now-checkout');

const getCheckoutPage = async (req, res, next) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }

    const userId = req.session.userId;

    try {
        const checkoutData = req.session.buyNowItem
            ? await buildBuyNowCheckoutData(userId, req.session.buyNowItem, req)
            : await checkoutService.prepareCheckout(userId, req);
        const wallet = await walletService.getWallet(userId);

        res.render('user/checkout', {
            checkout: checkoutData,
            walletBalance: Number(wallet && wallet.balance ? wallet.balance : 0),
            razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
            RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || ''
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

const buyNow = async (req, res) => {
    const { productId, variantId, quantity, selectedOfferId } = req.body;

    try {
        const product = await Product.findById(productId).select('isListed isDeleted variants').lean();
        const normalizedQuantity = Number(quantity);

        if (!productId || !variantId) {
            return res.status(400).json({
                success: false,
                message: 'Invalid product selection'
            });
        }

        if (!Number.isInteger(normalizedQuantity) || normalizedQuantity < 1 || normalizedQuantity > 5) {
            return res.status(400).json({
                success: false,
                message: 'Invalid quantity'
            });
        }

        if (!product || product.isListed !== true || product.isDeleted === true) {
            return res.status(400).json({
                success: false,
                message: 'Product not available'
            });
        }

        const variant = Array.isArray(product.variants)
            ? product.variants.find((entry) => String(entry && entry._id) === String(variantId))
            : null;

        if (!variant) {
            return res.status(400).json({
                success: false,
                message: 'Variant not found'
            });
        }

        if (Number(variant.stockCount || 0) <= 0 || normalizedQuantity > Number(variant.stockCount || 0)) {
            return res.status(400).json({
                success: false,
                message: 'Quantity exceeds available stock'
            });
        }

        req.session.buyNowItem = {
            productId: String(productId),
            variantId: String(variantId),
            quantity: normalizedQuantity,
            selectedOfferId: mongoose.Types.ObjectId.isValid(selectedOfferId) ? String(selectedOfferId) : null
        };

        return res.json({
            success: true
        });
    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message || 'Unable to start buy now'
        });
    }
};

const clearBuyNow = async (req, res) => {
    if (req.session) {
        delete req.session.buyNowItem;
    }

    return res.json({
        success: true
    });
};

module.exports = {
    getCheckoutPage,
    buyNow,
    clearBuyNow
};
