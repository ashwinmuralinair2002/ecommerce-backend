// Brand management controller for admin dashboard
const Brand = require('../models/Brand');
const Product = require('../models/Product');
const Order = require('../models/order.model');
const cloudinary = require('../config/cloudinary');
const HTTP_STATUS = require('../constants/http-status');

function normalizeCrop(rawCrop) {
    if (!rawCrop) return null;
    const source = typeof rawCrop === 'string' ? (() => {
        try { return JSON.parse(rawCrop); } catch { return null; }
    })() : rawCrop;
    if (!source || typeof source !== 'object') return null;
    const x = Number(source.x);
    const y = Number(source.y);
    const width = Number(source.width);
    const height = Number(source.height);
    if (![x, y, width, height].every(Number.isFinite)) return null;
    if (width <= 0 || height <= 0) return null;
    return {
        x: Math.max(0, Math.round(x)),
        y: Math.max(0, Math.round(y)),
        width: Math.round(width),
        height: Math.round(height)
    };
}

function normalizeOptionalUrl(value) {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';
    try {
        return new URL(trimmed).toString();
    } catch {
        return null;
    }
}

// @desc    Get All Brands (with Pagination)
// @route   GET /admin/brands
exports.getBrands = async (req, res) => {
    try {
        const { page = 1, search = '', status, sort } = req.query;
        const limit = 5;
        const currentPage = parseInt(page) || 1;

        const query = { isDeleted: false };

        if (search) {
            query.name = { $regex: search, $options: 'i' };
        }
        if (status === 'listed') {
            query.isActive = true;
        }
        if (status === 'unlisted') {
            query.isActive = false;
        }

        let sortOption = { createdAt: -1 };
        if (sort === 'oldest') sortOption = { createdAt: 1 };
        if (sort === 'az') sortOption = { name: 1 };
        if (sort === 'za') sortOption = { name: -1 };

        const totalBrands = await Brand.countDocuments(query);
        const totalPages = Math.ceil(totalBrands / limit);
        const skip = (currentPage - 1) * limit;

        const brands = await Brand.find(query)
            .sort(sortOption)
            .skip(skip)
            .limit(limit);

        await Promise.all(brands.map(async (brand) => {
            if (!brand.logoUrl) brand.logoUrl = '';
            brand.productCount = await Product.countDocuments({
                brand: brand._id
            });
        }));

        res.render('admin/admin-brands', {
            brands,
            search,
            status: status || '',
            currentSort: sort || 'newest',
            pagination: {
                currentPage,
                totalPages,
                totalBrands,
                hasNextPage: currentPage < totalPages,
                hasPrevPage: currentPage > 1
            }
        });
    } catch (error) {
        res.render('admin/admin-brands', {
            brands: [],
            search: '',
            status: '',
            currentSort: 'newest',
            error: 'Failed to load brands. Please try again.',
            pagination: { currentPage: 1, totalPages: 0, totalBrands: 0, hasNextPage: false, hasPrevPage: false }
        });
    }
};

// @desc    Render Add Brand Page
// @route   GET /admin/brands/add
exports.renderAddBrand = (req, res) => {
    res.render('admin/brands/add-brand', { error: null, errors: {}, oldInput: {} });
};

// @desc    Add Brand
// @route   POST /admin/brands
exports.addBrand = async (req, res) => {
    try {
        const { name, description, website, contactEmail, isActive } = req.body;
        const logoCrop = normalizeCrop(req.body.logoCrop);
        const errors = {};
        const normalizedWebsite = normalizeOptionalUrl(website);

        // Backend validation
        if (!name || name.trim().length < 2) {
            errors.name = 'Brand name is required (min 2 characters).';
        }
        if (!req.file) {
            errors.logo = 'Please upload a brand logo.';
        }
        if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
            errors.contactEmail = 'Please enter a valid email address.';
        }
        if (normalizedWebsite === null) {
            errors.website = 'Please enter a valid website URL.';
        }

        if (Object.keys(errors).length > 0) {
            return res.render('admin/brands/add-brand', {
                error: null,
                errors,
                oldInput: req.body
            });
        }

        // Check unique name
        const existingBrand = await Brand.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') }, isDeleted: false });
        if (existingBrand) {
            return res.render('admin/brands/add-brand', {
                error: 'Brand name already exists.',
                errors: {},
                oldInput: req.body
            });
        }

        const newBrand = new Brand({
            name: String(name || '').trim(),
            description: String(description || '').trim(),
            logoUrl: req.file.path,
            logoCrop,
            website: normalizedWebsite || '',
            contactEmail: String(contactEmail || '').trim(),
            isActive: isActive === 'on',
            productCount: 0
        });

        await newBrand.save();
        res.redirect('/admin/brands');

    } catch (error) {
        res.render('admin/brands/add-brand', {
            error: 'Failed to add brand. Please try again.',
            errors: {},
            oldInput: req.body
        });
    }
};

// @desc    Render Edit Brand Page
// @route   GET /admin/brands/:id/edit
exports.renderEditBrand = async (req, res) => {
    try {
        const brand = await Brand.findById(req.params.id);
        if (!brand) {
            return res.redirect('/admin/brands');
        }
        res.render('admin/brands/edit-brand', { brand, error: null, errors: {}, oldInput: null });
    } catch (error) {
        res.redirect('/admin/brands');
    }
};

// @desc    Get Brand Details
// @route   GET /admin/brands/:id
exports.getBrandDetails = async (req, res) => {
    try {
        const brand = await Brand.findById(req.params.id);
        if (!brand) return res.redirect('/admin/brands');

        const products = await Product.find({
            brand: brand._id
        }).sort({ createdAt: -1 });

        const productIds = products.map((product) => product._id);

        let salesData = [];
        if (productIds.length > 0) {
            salesData = await Order.aggregate([
                { $unwind: '$items' },
                {
                    $match: {
                        'items.productId': { $in: productIds }
                    }
                },
                {
                    $group: {
                        _id: '$items.productId',
                        unitsSold: { $sum: '$items.quantity' },
                        revenue: {
                            $sum: {
                                $multiply: ['$items.quantity', '$items.price']
                            }
                        },
                        orderIds: { $addToSet: '$_id' }
                    }
                }
            ]);
        }

        const salesByProductId = new Map(
            salesData.map((entry) => [
                String(entry._id),
                {
                    unitsSold: entry.unitsSold || 0,
                    revenue: entry.revenue || 0,
                    orderIds: Array.isArray(entry.orderIds) ? entry.orderIds : []
                }
            ])
        );

        const uniqueOrderIds = new Set();
        let totalUnits = 0;
        let totalRevenue = 0;

        products.forEach((product) => {
            const sales = salesByProductId.get(String(product._id));
            product.unitsSold = sales ? sales.unitsSold : 0;

            if (sales) {
                totalUnits += sales.unitsSold;
                totalRevenue += sales.revenue;
                sales.orderIds.forEach((orderId) => uniqueOrderIds.add(String(orderId)));
            }
        });

        const metrics = {
            totalProducts: products.length,
            totalOrders: uniqueOrderIds.size,
            totalUnits,
            totalRevenue
        };

        res.render('admin/brand-details', { brand, products, metrics });
    } catch (error) {
        res.redirect('/admin/brands');
    }
};

// @desc    Edit Brand
// @route   POST /admin/brands/:id/edit
exports.editBrand = async (req, res) => {
    try {
        if (!req.body) {
            throw new Error('Request body is missing');
        }

        const { name, description, website, contactEmail, isActive } = req.body;
        const logoCrop = normalizeCrop(req.body.logoCrop);
        const brand = await Brand.findById(req.params.id);
        const errors = {};
        const normalizedWebsite = normalizeOptionalUrl(website);

        if (!brand) {
            return res.redirect('/admin/brands');
        }

        if (!name || name.trim().length < 2) {
            errors.name = 'Brand name is required (min 2 characters).';
        }
        if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
            errors.contactEmail = 'Please enter a valid email address.';
        }
        if (normalizedWebsite === null) {
            errors.website = 'Please enter a valid website URL.';
        }

        if (Object.keys(errors).length > 0) {
            return res.render('admin/brands/edit-brand', {
                brand,
                error: null,
                errors,
                oldInput: req.body
            });
        }

        brand.name = String(name || '').trim();
        brand.description = String(description || '').trim();
        brand.website = normalizedWebsite || '';
        brand.contactEmail = String(contactEmail || '').trim();
        brand.isActive = isActive === 'on';

        if (req.file) {
            if (brand.logoUrl && brand.logoUrl.includes('cloudinary.com')) {
                try {
                    const urlParts = brand.logoUrl.split('/');
                    const filename = urlParts[urlParts.length - 1];
                    const publicId = 'soundwave_brands/' + filename.split('.')[0];
                    await cloudinary.uploader.destroy(publicId);
                } catch (deleteErr) {
                    // Silently continue — old image deletion is non-critical
                }
            }
            brand.logoUrl = req.file.path;
            brand.logoCrop = logoCrop;
        } else if (logoCrop) {
            brand.logoCrop = logoCrop;
        }

        await brand.save();
        res.redirect('/admin/brands');
    } catch (error) {
        // Re-render with error and preserved input
        const brand = await Brand.findById(req.params.id).catch(() => null);
        res.render('admin/brands/edit-brand', {
            brand: brand || { _id: req.params.id, name: '', description: '', logoUrl: '', website: '', contactEmail: '', isActive: true },
            error: 'Failed to update brand. Please try again.',
            errors: {},
            oldInput: req.body
        });
    }
};

// @desc    Toggle Status
// @route   POST /admin/brands/:id/toggle-status
exports.toggleBrandStatus = async (req, res) => {
    try {
        const brand = await Brand.findById(req.params.id);
        if (!brand) return res.redirect('/admin/brands');

        brand.isActive = !brand.isActive;
        await brand.save();
        if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
            return res.json({
                success: true,
                isListed: brand.isActive
            });
        }
        res.redirect(req.get('referer') || '/admin/brands');
    } catch (error) {
        if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
            return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                message: 'Failed to toggle brand status'
            });
        }
        res.redirect(req.get('referer') || '/admin/brands');
    }
};

// @desc    Delete Brand
// @route   POST /admin/brands/:id/delete
exports.deleteBrand = async (req, res) => {
    try {
        const brand = await Brand.findById(req.params.id);
        if (!brand) return res.redirect('/admin/brands');

        brand.isDeleted = true;
        await brand.save();
        res.redirect('/admin/brands');
    } catch (error) {
        res.redirect('/admin/brands');
    }
};
