// Home page controller for public and authenticated views
const Product = require('../models/Product');

// Helper: fetch products by badge
async function getProductsByBadge(badge, limit = 8) {
    return Product.find({
        badges: badge,
        isListed: true
    })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
}

// Public Landing Page
exports.getHomePage = async (req, res) => {
    try {
        const [bestSellers, newArrivals, deals] = await Promise.all([
            getProductsByBadge('Best seller'),
            getProductsByBadge('New'),
            getProductsByBadge('Deal')
        ]);
        res.render('user/home', { user: req.user, bestSellers, newArrivals, deals });
    } catch (error) {
        console.error('Error loading home page:', error);
        res.render('user/home', { user: req.user, bestSellers: [], newArrivals: [], deals: [] });
    }
};

// Protected Dashboard / Feed
exports.getPostLoginHomePage = async (req, res) => {
    try {
        const [bestSellers, newArrivals, deals] = await Promise.all([
            getProductsByBadge('Best seller'),
            getProductsByBadge('New'),
            getProductsByBadge('Deal')
        ]);
        res.render('user/post-login-home', { user: req.user, bestSellers, newArrivals, deals });
    } catch (error) {
        console.error('Error loading home page:', error);
        res.render('user/post-login-home', { user: req.user, bestSellers: [], newArrivals: [], deals: [] });
    }
};
