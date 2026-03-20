const wishlistService = require('../services/wishlist.service');

const getWishlistPage = async (req, res) => {
    try {
        const userId = req.session.userId;
        const wishlist = await wishlistService.getWishlist(userId);

        res.render('user/wishlist', {
            wishlist: {
                items: Array.isArray(wishlist && wishlist.items) ? wishlist.items : []
            }
        });
    } catch (error) {
        res.status(500).send('Failed to load wishlist');
    }
};

const addToWishlist = async (req, res) => {
    const userId = req.session.userId;
    const { productId, variantId } = req.body;

    try {
        const result = await wishlistService.addToWishlist(userId, productId, variantId);
        res.json(result);
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

const removeFromWishlist = async (req, res) => {
    const userId = req.session.userId;
    const { productId, variantId } = req.query;

    try {
        const result = await wishlistService.removeFromWishlist(userId, productId, variantId);
        res.json(result);
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

const moveToCart = async (req, res) => {
    const userId = req.session.userId;
    const { productId, variantId } = req.query;

    try {
        const result = await wishlistService.moveToCart(userId, productId, variantId);
        res.json(result);
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

module.exports = {
    getWishlistPage,
    addToWishlist,
    removeFromWishlist,
    moveToCart
};
