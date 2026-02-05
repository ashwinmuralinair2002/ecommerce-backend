// Brand management controller for admin dashboard
const Brand = require('../models/Brand');
const cloudinary = require('../config/cloudinary');

// @desc    Get All Brands (with Pagination)
// @route   GET /admin/brands
exports.getBrands = async (req, res) => {
    try {
        const { page = 1, search = '' } = req.query;
        const limit = 5; // 5 brands per page
        const currentPage = parseInt(page) || 1;

        const query = { isDeleted: false };

        // Search Logic
        if (search) {
            query.name = { $regex: search, $options: 'i' };
        }

        // Get total count for pagination
        const totalBrands = await Brand.countDocuments(query);
        const totalPages = Math.ceil(totalBrands / limit);
        const skip = (currentPage - 1) * limit;

        const brands = await Brand.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // Ensure logoUrl defaults if missing (for old data)
        brands.forEach(b => {
            if (!b.logoUrl) b.logoUrl = '';
            if (b.productCount === undefined) b.productCount = 0;
        });

        res.render('admin/admin-brands', {
            brands,
            search, // Pass search term to view
            pagination: {
                currentPage,
                totalPages,
                totalBrands,
                hasNextPage: currentPage < totalPages,
                hasPrevPage: currentPage > 1
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};

// @desc    Render Add Brand Page -- Keeping existing flow
// @route   GET /admin/brands/add
exports.renderAddBrand = (req, res) => {
    res.render('admin/brands/add-brand');
};

// @desc    Add Brand
// @route   POST /admin/brands
exports.addBrand = async (req, res) => {
    try {
        const { name, description, website, contactEmail, isActive } = req.body;

        // 1. Validate file upload OR URL
        if (!req.file && !req.body.logoUrl) {
            return res.render('admin/brands/add-brand', {
                error: 'Please upload a brand logo or provide a URL.',
                oldInput: req.body
            });
        }

        // 2. Validate unique name
        const existingBrand = await Brand.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') }, isDeleted: false });
        if (existingBrand) {
            return res.render('admin/brands/add-brand', {
                error: 'Brand name already exists.',
                oldInput: req.body
            });
        }

        // 3. Create Brand - use Cloudinary URL from req.file.path
        let logoUrl = '';
        if (req.file) {
            logoUrl = req.file.path; // Cloudinary URL
        } else if (req.body.logoUrl) {
            logoUrl = req.body.logoUrl;
        }

        const newBrand = new Brand({
            name,
            description,
            logoUrl,
            website,
            contactEmail,
            isActive: isActive === 'on', // Checkbox sends 'on' if checked
            productCount: 0
        });

        await newBrand.save();
        res.redirect('/admin/brands');

    } catch (error) {
        console.error(error);
        res.render('admin/brands/add-brand', {
            error: 'Server Error: ' + error.message,
            oldInput: req.body
        });
    }
};

// @desc    Render Edit Brand Page
// @route   GET /admin/brands/:id/edit
exports.renderEditBrand = async (req, res) => {
    try {
        const brand = await Brand.findById(req.params.id);
        if (!brand) return res.status(404).send('Brand not found');
        res.render('admin/brands/edit-brand', { brand });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};

// @desc    Get Brand Details
// @route   GET /admin/brands/:id
exports.getBrandDetails = async (req, res) => {
    try {
        const brand = await Brand.findById(req.params.id);
        if (!brand) return res.status(404).send('Brand not found');

        // Mock data as requested since Product model is not fully wired/populated with brands
        const products = [];
        // Example mock product if brand.productCount > 0 could be added here if needed, 
        // but for now empty array is safer than crashing on missing model.
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
        console.error(error);
        res.status(500).send('Server Error');
    }
};

// @desc    Edit Brand
// @route   POST /admin/brands/:id/edit
exports.editBrand = async (req, res) => {
    try {
        if (!req.body) {
            throw new Error('req.body is undefined - Body parsing failed');
        }

        const { name, description, logoUrl } = req.body;
        const brand = await Brand.findById(req.params.id);

        brand.name = name || brand.name;
        brand.description = description || brand.description;

        // Priority: 1. New File Upload (Cloudinary), 2. New URL input, 3. Keep existing
        if (req.file) {
            // Delete old image from Cloudinary if it exists and is a Cloudinary URL
            if (brand.logoUrl && brand.logoUrl.includes('cloudinary.com')) {
                try {
                    // Extract public_id from URL
                    const urlParts = brand.logoUrl.split('/');
                    const filename = urlParts[urlParts.length - 1];
                    const publicId = 'soundwave_brands/' + filename.split('.')[0];
                    await cloudinary.uploader.destroy(publicId);
                    console.log('[Brand] Old Cloudinary image deleted:', publicId);
                } catch (deleteErr) {
                    console.error('[Brand] Failed to delete old Cloudinary image:', deleteErr.message);
                }
            }
            brand.logoUrl = req.file.path; // Cloudinary URL
        } else if (logoUrl && logoUrl.trim() !== '') {
            brand.logoUrl = logoUrl;
        }

        await brand.save();
        res.redirect('/admin/brands');
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};

// @desc    Toggle Status
// @route   POST /admin/brands/:id/toggle-status
exports.toggleBrandStatus = async (req, res) => {
    try {
        const brand = await Brand.findById(req.params.id);
        if (!brand) return res.status(404).send('Brand not found');

        brand.isActive = !brand.isActive;
        await brand.save();
        // Redirect back to the same brand detail page
        res.redirect('/admin/brands/' + req.params.id);
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};

// @desc    Delete Brand
// @route   POST /admin/brands/:id/delete
exports.deleteBrand = async (req, res) => {
    try {
        const brand = await Brand.findById(req.params.id);
        if (!brand) return res.status(404).send('Brand not found');

        // if (brand.productCount > 0) { ... } validation removed to allow force delete

        brand.isDeleted = true;
        await brand.save();
        res.redirect('/admin/brands');
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};
