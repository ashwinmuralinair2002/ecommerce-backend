const mongoose = require('mongoose');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Brand = require('../models/Brand');

/**
 * @desc    Get all listed products with filtering and sorting (Catalog Page)
 * @route   GET /products
 * @access  Public
 */
exports.getAllProducts = async (req, res) => {
    try {
        const { category, brand, connection, minPrice, maxPrice, sort } = req.query;

        // --- 1. Build Query Object ---
        let filter = { isListed: true };

        // Category Filter
        if (category) {
            const categories = Array.isArray(category) ? category : [category];
            const categoryIds = categories
                .filter(id => mongoose.Types.ObjectId.isValid(id))
                .map(id => new mongoose.Types.ObjectId(id));

            if (categoryIds.length > 0) {
                filter.category = { $in: categoryIds };
            }
        }

        // Brand Filter
        if (brand) {
            const brands = Array.isArray(brand) ? brand : [brand];
            const brandIds = brands
                .filter(id => mongoose.Types.ObjectId.isValid(id))
                .map(id => new mongoose.Types.ObjectId(id));

            if (brandIds.length > 0) {
                filter.brand = { $in: brandIds };
            }
        }

        // Connection Type Filter
        if (connection) {
            const connections = Array.isArray(connection) ? connection : [connection];
            filter.connectionType = { $in: connections };
        }

        // Price Range Filter
        // Requirement: Minimum price is 100.
        filter.price = { $gte: 100 };

        if (minPrice || maxPrice) {
            if (minPrice) {
                const min = Math.max(100, Number(minPrice));
                filter.price.$gte = min;
            }
            if (maxPrice) {
                filter.price.$lte = Number(maxPrice);
            }
        }

        // --- 2. Build Sort Object ---
        let sortOption = { createdAt: -1 }; // Default: Newest

        switch (sort) {
            case 'price_asc':
                sortOption = { price: 1 };
                break;
            case 'price_desc':
                sortOption = { price: -1 };
                break;
            case 'az':
                sortOption = { title: 1 };
                break;
            case 'za':
                sortOption = { title: -1 };
                break;
            case 'newest':
            default:
                sortOption = { createdAt: -1 };
                break;
        }

        // --- 3. Fetch Data ---
        // Fetch products with filter and sort
        const products = await Product.find(filter)
            .sort(sortOption)
            .lean();

        // Fetch active brands and categories for sidebar
        const [allCategories, brands] = await Promise.all([
            Category.find({ isListed: true }).lean(),
            Brand.find({ isActive: true, isDeleted: false }).lean()
        ]);

        console.log("Brands fetched:", brands.length);

        // Filter categories to only show target types
        const targetCategories = ['In-Ear', 'On-Ear', 'Over-Ear'];
        const categories = allCategories.filter(cat => targetCategories.includes(cat.name));

        // Render View
        res.render('user/products', {
            title: 'Products',
            user: req.user,
            products,
            filters: req.query, // Pass filters for view state (renamed from query to match request, or keep query if view uses it)
            categories,
            brands,
            query: req.query // Keep query for backward compatibility or clarity if view uses it
        });

    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).render('error', {
            message: 'Error loading products',
            user: req.user
        });
    }
};
