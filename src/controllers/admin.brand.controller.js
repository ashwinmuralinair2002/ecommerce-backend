// Brand management controller for admin dashboard
const Brand = require('../models/Brand');
const cloudinary = require('../config/cloudinary');

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

        brands.forEach(b => {
            if (!b.logoUrl) b.logoUrl = '';
            if (b.productCount === undefined) b.productCount = 0;
        });

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

        // Backend validation
        if (!name || name.trim().length < 2) {
            errors.name = 'Brand name is required (min 2 characters).';
        }
        if (!req.file && !req.body.logoUrl) {
            errors.logo = 'Please upload a brand logo or provide a URL.';
        }
        if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
            errors.contactEmail = 'Please enter a valid email address.';
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

        let logoUrl = '';
        if (req.file) {
            logoUrl = req.file.path;
        } else if (req.body.logoUrl) {
            logoUrl = req.body.logoUrl;
        }

        const newBrand = new Brand({
            name,
            description,
            logoUrl,
            logoCrop,
            website,
            contactEmail,
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

        const products = [];
        if (brand.productCount > 0) {
            products.push({
                _id: 'mock_prod_1',
                name: 'Sample Product for ' + brand.name,
                sku: 'SKU-001',
                price: 2999,
                stock: 15,
                isActive: true
            });
        }

        const metrics = null;

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

        const { name, description, logoUrl } = req.body;
        const logoCrop = normalizeCrop(req.body.logoCrop);
        const brand = await Brand.findById(req.params.id);
        const errors = {};

        if (!brand) {
            return res.redirect('/admin/brands');
        }

        if (!name || name.trim().length < 2) {
            errors.name = 'Brand name is required (min 2 characters).';
        }

        if (Object.keys(errors).length > 0) {
            return res.render('admin/brands/edit-brand', {
                brand,
                error: null,
                errors,
                oldInput: req.body
            });
        }

        brand.name = name || brand.name;
        brand.description = description || brand.description;

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
        } else if (logoUrl && logoUrl.trim() !== '') {
            brand.logoUrl = logoUrl;
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
            brand: brand || { _id: req.params.id, name: '', description: '', logoUrl: '' },
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
            return res.status(500).json({
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
