const mongoose = require('mongoose');
const Product = require('../models/Product');
const checkoutService = require('../services/checkout.service');
const walletService = require('../services/wallet.service');
const { buildBuyNowCheckoutData } = require('../utils/buy-now-checkout');

const buildBuyNowContextItem = (buyNowItem, price = null) => ({
    productId: String(buyNowItem.productId),
    variantId: String(buyNowItem.variantId),
    quantity: Number(buyNowItem.quantity),
    price: Number.isFinite(Number(price)) ? Number(price) : null,
    selectedOfferId: mongoose.Types.ObjectId.isValid(buyNowItem.selectedOfferId) ? String(buyNowItem.selectedOfferId) : null
});

const syncBuyNowSessionState = (req, buyNowContextItem) => {
    req.session.buyNowItem = {
        productId: buyNowContextItem.productId,
        variantId: buyNowContextItem.variantId,
        quantity: buyNowContextItem.quantity,
        selectedOfferId: buyNowContextItem.selectedOfferId
    };

    req.session.checkoutContext = {
        type: 'buyNow',
        item: buyNowContextItem
    };
};

const getCheckoutPage = async (req, res, next) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }

    const userId = req.session.userId;

    try {
        req.session.checkoutContext = {
            type: 'cart'
        };

        const checkoutData = await checkoutService.prepareCheckout(userId, req);
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

const getBuyNowCheckoutPage = async (req, res, next) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }

    const userId = req.session.userId;
    const context = req.session.checkoutContext;

    if (!context || context.type !== 'buyNow' || !context.item) {
        return res.redirect('/cart');
    }

    try {
        syncBuyNowSessionState(req, buildBuyNowContextItem(context.item, context.item.price));

        const checkoutData = await buildBuyNowCheckoutData(userId, req.session.buyNowItem, req);
        const currentItem = checkoutData && Array.isArray(checkoutData.items) ? checkoutData.items[0] : null;

        if (currentItem) {
            syncBuyNowSessionState(req, buildBuyNowContextItem({
                ...context.item,
                productId: currentItem.productId,
                variantId: currentItem.variantId,
                quantity: currentItem.quantity,
                selectedOfferId: currentItem.selectedOfferId
            }, currentItem.priceSnapshot));
        }

        const wallet = await walletService.getWallet(userId);

        return res.render('user/checkout', {
            checkout: checkoutData,
            walletBalance: Number(wallet && wallet.balance ? wallet.balance : 0),
            razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
            RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || ''
        });
    } catch (error) {
        if (
            error.message === 'Product not available'
            || error.message === 'Variant not found'
            || error.message === 'Out of stock'
            || error.message === 'Quantity exceeds available stock'
            || error.message === 'No delivery address selected'
            || error.message === 'Invalid product selection'
            || error.message === 'Invalid quantity'
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

        syncBuyNowSessionState(req, buildBuyNowContextItem({
            productId,
            variantId,
            quantity: normalizedQuantity,
            selectedOfferId
        }));

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
        if (req.session.checkoutContext && req.session.checkoutContext.type === 'buyNow') {
            delete req.session.checkoutContext;
        }
    }

    return res.json({
        success: true
    });
};

const retryCheckout = (req, res) => {
    const context = req.session.checkoutContext;

    if (!context || !context.type) {
        return res.redirect('/cart');
    }

    if (context.type === 'buyNow') {
        return res.redirect('/checkout/buy-now');
    }

    return res.redirect('/checkout');
};

module.exports = {
    getCheckoutPage,
    getBuyNowCheckoutPage,
    buyNow,
    clearBuyNow,
    retryCheckout
};
