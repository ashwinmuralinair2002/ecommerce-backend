// Admin product management controller
const Product = require('../models/Product');
const Brand = require('../models/Brand');
const cloudinary = require('../config/cloudinary');

// @desc    Get Products Page (with Search, Filter, Sort, Pagination)
// @route   GET /admin/products
const getProductsPage = async (req, res) => {
    try {
        const { search, page = 1, category, brand, connectionType, sort } = req.query;
        const limit = 10;
        const currentPage = parseInt(page) || 1;

        // Base query: only listed products
        let query = { isListed: { $ne: false } };

        // Search by title or SKU
        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { sku: { $regex: search, $options: 'i' } }
            ];
        }

        // Filters
        if (category) {
            query.category = category;
        }
        if (brand) {
            query.brand = brand;
        }
        if (connectionType) {
            query.connectionType = connectionType;
        }

        // Sort
        let sortObj = { createdAt: -1 }; // default: newest first
        switch (sort) {
            case 'az':
                sortObj = { title: 1 };
                break;
            case 'za':
                sortObj = { title: -1 };
                break;
            case 'price_asc':
                sortObj = { price: 1 };
                break;
            case 'price_desc':
                sortObj = { price: -1 };
                break;
            case 'newest':
                sortObj = { createdAt: -1 };
                break;
        }

        const totalProducts = await Product.countDocuments(query);
        const totalPages = Math.ceil(totalProducts / limit);

        // Redirect to last valid page if current exceeds total
        if (currentPage > totalPages && totalPages > 0) {
            const params = new URLSearchParams(req.query);
            params.set('page', totalPages);
            return res.redirect(`/admin/products?${params.toString()}`);
        }

        const skip = (currentPage - 1) * limit;

        const products = await Product.find(query)
            .populate('brand', 'name')
            .sort(sortObj)
            .skip(skip)
            .limit(limit);

        // Get listed brands for filter dropdown
        const brands = await Brand.find({ isDeleted: { $ne: true }, isActive: true }).sort({ name: 1 });

        res.render('admin/admin-products', {
            products,
            brands,
            search: search || '',
            filters: {
                category: category || '',
                brand: brand || '',
                connectionType: connectionType || ''
            },
            currentSort: sort || 'newest',
            pagination: {
                currentPage,
                totalPages,
                totalProducts,
                hasNextPage: currentPage < totalPages,
                hasPrevPage: currentPage > 1
            }
        });
    } catch (error) {
        console.error('Error loading products:', error);
        res.render('admin/admin-products', {
            products: [],
            brands: [],
            search: '',
            filters: { category: '', brand: '', connectionType: '' },
            currentSort: 'newest',
            error: 'Failed to load products. Please try again.',
            pagination: { currentPage: 1, totalPages: 0, totalProducts: 0, hasNextPage: false, hasPrevPage: false }
        });
    }
};

// @desc    Soft delete products (set isListed = false)
// @route   POST /admin/products/soft-delete
const softDeleteProducts = async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, message: 'No products selected' });
        }
        await Product.updateMany({ _id: { $in: ids } }, { isListed: false });
        return res.json({ success: true, message: `${ids.length} product(s) unlisted successfully` });
    } catch (error) {
        console.error('Error soft deleting products:', error);
        return res.status(500).json({ success: false, message: 'Failed to delete products' });
    }
};

// @desc    Soft delete a single product (set isListed = false)
// @route   DELETE /admin/products/:id
const softDeleteProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }
        product.isListed = false;
        await product.save();
        return res.json({ success: true, message: 'Product unlisted successfully' });
    } catch (error) {
        console.error('Error soft deleting product:', error);
        return res.status(500).json({ success: false, message: 'Failed to delete product' });
    }
};

// @desc    Get Product Detail Page
// @route   GET /admin/products/:id
const getProductDetailPage = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id).populate('brand', 'name');
        if (!product) {
            return res.redirect('/admin/products');
        }
        res.render('admin/admin-product-detail', { product });
    } catch (error) {
        console.error('Error loading product detail:', error);
        return res.redirect('/admin/products');
    }
};

// @desc    Get Add Product Page (with brand list)
// @route   GET /admin/products/add
const getAddProductPage = async (req, res) => {
    try {
        const brands = await Brand.find({ isDeleted: { $ne: true }, isActive: true }).sort({ name: 1 });
        res.render('admin/admin-add-product', { brands });
    } catch (error) {
        console.error('Error loading add product page:', error);
        res.render('admin/admin-add-product', { brands: [] });
    }
};

// @desc    Get Edit Product Page (pre-filled)
// @route   GET /admin/products/edit/:id
const getEditProductPage = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id).populate('brand', 'name');
        if (!product) {
            return res.redirect('/admin/products');
        }
        const brands = await Brand.find({ isDeleted: { $ne: true }, isActive: true }).sort({ name: 1 });
        res.render('admin/admin-edit-product', { product, brands });
    } catch (error) {
        console.error('Error loading edit product page:', error);
        return res.redirect('/admin/products');
    }
};

// @desc    Create a new product
// @route   POST /admin/products
const createProduct = async (req, res) => {
    try {
        const {
            title, sku, brand, connectionType, category, shortDescription,
            price, originalPrice, discountPercentage,
            stockCount, reservedCount, reorderThreshold,
            cableLength, connectorType, impedance, driverSize,
            bluetoothVersion, batteryLife, chargingTime, wirelessRange, noiseCancellation,
            length, width, height, weight,
            metaTitle, metaDescription, badges
        } = req.body;

        // Build images array from uploaded files
        const images = [];
        if (req.files && req.files.length > 0) {
            req.files.forEach((file, index) => {
                images.push({
                    url: file.path,
                    public_id: file.filename,
                    isHero: index === 0
                });
            });
        }

        // Validate minimum 3 images
        if (images.length < 3) {
            // Clean up uploaded images from Cloudinary
            for (const img of images) {
                await cloudinary.uploader.destroy(img.public_id);
            }
            return res.status(400).json({
                success: false,
                message: 'Minimum 3 images required'
            });
        }

        // Auto-generate SKU if not provided
        const productSku = sku || `SKU-${Date.now()}`;

        const product = new Product({
            title,
            sku: productSku,
            brand,
            connectionType,
            category,
            shortDescription: shortDescription || '',
            price: parseFloat(price),
            originalPrice: originalPrice ? parseFloat(originalPrice) : null,
            discountPercentage: discountPercentage ? parseFloat(discountPercentage) : 0,
            stockCount: parseInt(stockCount) || 0,
            reservedCount: parseInt(reservedCount) || 0,
            reorderThreshold: parseInt(reorderThreshold) || 5,
            images,
            cableLength: cableLength || '',
            connectorType: connectorType || '',
            impedance: impedance || '',
            driverSize: driverSize || '',
            bluetoothVersion: bluetoothVersion || '',
            batteryLife: batteryLife || '',
            chargingTime: chargingTime || '',
            wirelessRange: wirelessRange || '',
            noiseCancellation: noiseCancellation || '',
            length: length ? parseFloat(length) : null,
            width: width ? parseFloat(width) : null,
            height: height ? parseFloat(height) : null,
            weight: weight ? parseFloat(weight) : null,
            metaTitle: metaTitle || '',
            metaDescription: metaDescription || '',
            badges: badges ? (Array.isArray(badges) ? badges : [badges]) : []
        });

        await product.save();
        return res.json({ success: true, message: 'Product created successfully', productId: product._id });
    } catch (error) {
        console.error('Error creating product:', error);
        // Clean up uploaded images on error
        if (req.files) {
            for (const file of req.files) {
                await cloudinary.uploader.destroy(file.filename).catch(() => { });
            }
        }
        return res.status(500).json({ success: false, message: error.message || 'Failed to create product' });
    }
};

// @desc    Update an existing product
// @route   PUT /admin/products/:id
const updateProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        const {
            title, sku, brand, connectionType, category, shortDescription,
            price, originalPrice, discountPercentage,
            stockCount, reservedCount, reorderThreshold,
            cableLength, connectorType, impedance, driverSize,
            bluetoothVersion, batteryLife, chargingTime, wirelessRange, noiseCancellation,
            length, width, height, weight,
            metaTitle, metaDescription, badges,
            existingImages, // JSON string of kept image objects
            newHeroIndex    // Index of new file that should be hero (-1 if hero is existing)
        } = req.body;

        // Parse existing images that user wants to keep
        let keptImages = [];
        if (existingImages) {
            try {
                // Strip Mongoose _id to avoid subdocument conflicts on save
                keptImages = JSON.parse(existingImages).map(img => ({
                    url: img.url,
                    public_id: img.public_id,
                    isHero: img.isHero || false
                }));
            } catch (e) {
                keptImages = [];
            }
        }

        // Find images that were removed
        const keptPublicIds = keptImages.map(img => img.public_id);
        const removedImages = product.images.filter(img => !keptPublicIds.includes(img.public_id));

        // Delete removed images from Cloudinary
        for (const img of removedImages) {
            await cloudinary.uploader.destroy(img.public_id).catch(() => { });
        }

        // Build new images array: kept + newly uploaded
        const newImages = [];
        const heroIdx = parseInt(newHeroIndex) || -1;
        if (req.files && req.files.length > 0) {
            // If a new file is hero, clear hero from all kept images
            if (heroIdx >= 0) {
                keptImages.forEach(img => { img.isHero = false; });
            }
            req.files.forEach((file, i) => {
                newImages.push({
                    url: file.path,
                    public_id: file.filename,
                    isHero: (i === heroIdx)
                });
            });
        }

        const allImages = [...keptImages, ...newImages];

        // Validate minimum 3 images
        if (allImages.length < 3) {
            // Clean up newly uploaded images
            for (const img of newImages) {
                await cloudinary.uploader.destroy(img.public_id).catch(() => { });
            }
            return res.status(400).json({
                success: false,
                message: 'Minimum 3 images required'
            });
        }

        // Ensure exactly one hero image — respect isHero flag from frontend
        const hasHero = allImages.some(img => img.isHero);
        if (!hasHero && allImages.length > 0) {
            allImages[0].isHero = true;
        }

        // Update product fields
        product.title = title;
        product.sku = sku || product.sku;
        product.brand = brand;
        product.connectionType = connectionType;
        product.category = category;
        product.shortDescription = shortDescription || '';
        product.price = parseFloat(price);
        product.originalPrice = originalPrice ? parseFloat(originalPrice) : null;
        product.discountPercentage = discountPercentage ? parseFloat(discountPercentage) : 0;
        product.stockCount = parseInt(stockCount) || 0;
        product.reservedCount = parseInt(reservedCount) || 0;
        product.reorderThreshold = parseInt(reorderThreshold) || 5;
        product.images = allImages;
        product.markModified('images');
        product.cableLength = cableLength || '';
        product.connectorType = connectorType || '';
        product.impedance = impedance || '';
        product.driverSize = driverSize || '';
        product.bluetoothVersion = bluetoothVersion || '';
        product.batteryLife = batteryLife || '';
        product.chargingTime = chargingTime || '';
        product.wirelessRange = wirelessRange || '';
        product.noiseCancellation = noiseCancellation || '';
        product.length = length ? parseFloat(length) : null;
        product.width = width ? parseFloat(width) : null;
        product.height = height ? parseFloat(height) : null;
        product.weight = weight ? parseFloat(weight) : null;
        product.metaTitle = metaTitle || '';
        product.metaDescription = metaDescription || '';
        product.badges = badges ? (Array.isArray(badges) ? badges : [badges]) : [];

        await product.save();
        return res.json({ success: true, message: 'Product updated successfully' });
    } catch (error) {
        console.error('Error updating product:', error);
        // Clean up newly uploaded images on error
        if (req.files) {
            for (const file of req.files) {
                await cloudinary.uploader.destroy(file.filename).catch(() => { });
            }
        }
        return res.status(500).json({ success: false, message: error.message || 'Failed to update product' });
    }
};

// @desc    Delete a single image from a product
// @route   DELETE /admin/products/:id/images/:imageId
const deleteProductImage = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        const imageToRemove = product.images.id(req.params.imageId);
        if (!imageToRemove) {
            return res.status(404).json({ success: false, message: 'Image not found' });
        }

        // Delete from Cloudinary
        await cloudinary.uploader.destroy(imageToRemove.public_id).catch(() => { });

        const wasHero = imageToRemove.isHero;

        // Remove from product
        product.images.pull(req.params.imageId);

        // If removed image was hero, promote first remaining
        if (wasHero && product.images.length > 0) {
            product.images[0].isHero = true;
        }

        await product.save();
        return res.json({ success: true, message: 'Image removed' });
    } catch (error) {
        console.error('Error deleting product image:', error);
        return res.status(500).json({ success: false, message: 'Failed to delete image' });
    }
};

module.exports = {
    getProductsPage,
    softDeleteProducts,
    softDeleteProduct,
    getProductDetailPage,
    getAddProductPage,
    getEditProductPage,
    createProduct,
    updateProduct,
    deleteProductImage
};
