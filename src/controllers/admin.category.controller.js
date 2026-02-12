// Category management controller for admin dashboard
const Category = require('../models/Category');

// @desc    Get Categories Page
// @route   GET /admin/categories
exports.getCategoriesPage = async (req, res) => {
    try {
        const categories = await Category.find().sort({ name: 1 });
        res.render('admin/admin-categories', { categories });
    } catch (error) {
        console.error('Error loading categories:', error);
        res.render('admin/admin-categories', {
            categories: [],
            error: 'Failed to load categories. Please try again.'
        });
    }
};

// @desc    Toggle Category isListed
// @route   POST /admin/categories/:id/toggle-listing
exports.toggleCategoryListing = async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);
        if (!category) {
            return res.status(404).json({ success: false, message: 'Category not found' });
        }

        category.isListed = !category.isListed;
        await category.save();

        res.json({
            success: true,
            isListed: category.isListed,
            message: `Category "${category.name}" is now ${category.isListed ? 'Listed' : 'Unlisted'}`
        });
    } catch (error) {
        console.error('Error toggling category:', error);
        res.status(500).json({ success: false, message: 'Failed to update category' });
    }
};
