// Home page controller for public and authenticated views
const Category = require('../models/Category');

// Public Landing Page
exports.getHomePage = async (req, res) => {
    try {
        const categories = await Category.find({ isListed: true }).sort({ name: 1 });
        res.render('user/home', { user: req.user, categories });
    } catch (error) {
        console.error('Error loading home page:', error);
        res.render('user/home', { user: req.user, categories: [] });
    }
};

// Protected Dashboard / Feed
exports.getPostLoginHomePage = async (req, res) => {
    try {
        const categories = await Category.find({ isListed: true }).sort({ name: 1 });
        res.render('user/post-login-home', { user: req.user, categories });
    } catch (error) {
        console.error('Error loading home page:', error);
        res.render('user/post-login-home', { user: req.user, categories: [] });
    }
};
