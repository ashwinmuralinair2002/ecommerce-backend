// Admin product management controller
const Product = require('../models/Product');
const Brand = require('../models/Brand');
const Category = require('../models/Category'); // Added Category import
const cloudinary = require('../config/cloudinary');

const ENUM_MAP = {
    noiseControlTypes: [
        'Active Noise Cancellation',
        'Passive Noise Cancellation',
        'Feedforward ANC',
        'Feedback ANC',
        'Hybrid ANC',
        'Adaptive Noise Cancellation',
        'Environmental Noise Cancellation',
        'None',
        // Backward compatibility for existing products
        'Passive Noise Isolation'
    ],
    controlMethods: ['Touch', 'Button', 'Voice', 'App'],
    cableFeatures: ['Detachable Cable', 'Braided Cable', 'Tangle Free', 'Inline Remote'],
    smartFeatures: ['Voice Assistant', 'Multipoint', 'Companion App', 'Adaptive Audio'],
    compatibleDevices: ['Android', 'iOS', 'Windows', 'Mac', 'PlayStation', 'Xbox'],
    materials: ['Plastic', 'Aluminium', 'Steel', 'Leather', 'Fabric', 'Silicone'],
    includedComponents: ['Carrying Case', 'Charging Cable', 'Audio Cable', 'Ear Tips', 'User Manual'],
    audioDriverTypes: ['Dynamic', 'Planar Magnetic', 'Balanced Armature', 'Hybrid'],
    formFactor: ['In-Ear', 'On-Ear', 'Over-Ear'],
    earpieceShape: ['Round', 'Oval', 'Ergonomic'],
    impedanceRange: ['Up to 32 Ohm', '33-80 Ohm', '81-250 Ohm', '250+ Ohm'],
    sensitivityRange: ['Up to 95 dB', '96-105 dB', '106-115 dB', '115+ dB']
};

function asArray(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (typeof value === 'string' && value.trim()) return [value.trim()];
    return [];
}

function normalizeArrayEnum(value, allowedValues) {
    return asArray(value).filter((item) => allowedValues.includes(item));
}

function normalizeSingleEnum(value, allowedValues) {
    return allowedValues.includes(value) ? value : null;
}

function parseBooleanLike(value) {
    return value === true || value === 'true' || value === 'on' || value === '1';
}

function normalizeHexColor(input) {
    if (!input) return '';
    const value = String(input).trim().toUpperCase();
    if (/^#?[0-9A-F]{6}$/.test(value)) {
        return value.startsWith('#') ? value : `#${value}`;
    }
    return '';
}

function parseVariantPayload(payloadRaw) {
    if (!payloadRaw) return [];
    try {
        const parsed = typeof payloadRaw === 'string' ? JSON.parse(payloadRaw) : payloadRaw;
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function normalizeCrop(rawCrop) {
    if (!rawCrop || typeof rawCrop !== 'object') return null;
    const x = Number(rawCrop.x);
    const y = Number(rawCrop.y);
    const width = Number(rawCrop.width);
    const height = Number(rawCrop.height);
    if (![x, y, width, height].every(Number.isFinite)) return null;
    if (width <= 0 || height <= 0) return null;
    return {
        x: Math.max(0, Math.round(x)),
        y: Math.max(0, Math.round(y)),
        width: Math.round(width),
        height: Math.round(height)
    };
}

async function migrateLegacyProductImages(product) {
    if (!product) return product;
    const variants = Array.isArray(product.variants) ? product.variants : [];
    const images = Array.isArray(product.images) ? product.images : [];
    if (variants.length === 0 && images.length >= 3) {
        product.variants = [{
            colorName: 'Default',
            colorCode: '#000000',
            images: images.map((img) => ({
                url: img.url,
                public_id: img.public_id
            }))
        }];
        product.images = [];
        product.markModified('variants');
        product.markModified('images');
        await product.save();
    }
    return product;
}

async function buildVariantsFromRequest(req, existingVariants = []) {
    const payload = parseVariantPayload(req.body.variantPayload);
    if (!payload.length) return [];

    const variants = [];
    for (let i = 0; i < payload.length; i++) {
        const row = payload[i] || {};
        const colorCode = normalizeHexColor(row.colorCode);
        if (!colorCode) {
            throw new Error('Invalid variant color. Use valid HEX or CSS color name.');
        }

        const colorName = String(row.colorName || '').trim();
        const stockCount = Math.max(0, parseInt(row.stockCount, 10) || 0);
        const keptImages = Array.isArray(row.existingImages)
            ? row.existingImages
                .map((img, index) => ({
                    url: img && img.url ? img.url : '',
                    public_id: img && img.public_id ? img.public_id : '',
                    crop: normalizeCrop(Array.isArray(row.existingImageCrops) ? row.existingImageCrops[index] : null)
                }))
                .filter((img) => img.url && img.public_id)
            : [];

        const newFiles = (req.files || []).filter((file) => file.fieldname === `variantImages_${i}`);
        const uploadedImages = newFiles.map((file, index) => ({
            url: file.path,
            public_id: file.filename,
            crop: normalizeCrop(Array.isArray(row.newImageCrops) ? row.newImageCrops[index] : null)
        }));

        const mergedImages = [...keptImages, ...uploadedImages];
        if (mergedImages.length < 3 || mergedImages.length > 10) {
            throw new Error('Each variant must contain between 3 and 10 images.');
        }

        variants.push({
            _id: row._id || undefined,
            colorName,
            colorCode,
            stockCount,
            images: mergedImages
        });
    }

    // Cleanup removed variant images when editing.
    const incomingPublicIds = new Set(
        variants.flatMap((v) => v.images.map((img) => img.public_id)).filter(Boolean)
    );
    const oldPublicIds = new Set(
        (existingVariants || []).flatMap((v) => (v.images || []).map((img) => img.public_id)).filter(Boolean)
    );

    for (const publicId of oldPublicIds) {
        if (!incomingPublicIds.has(publicId)) {
            await cloudinary.uploader.destroy(publicId).catch(() => { });
        }
    }

    return variants;
}

// @desc    Get Products Page (with Search, Filter, Sort, Pagination)
// @route   GET /admin/products
const getProductsPage = async (req, res) => {
    try {
        const { search, page = 1, category, brand, connectionType, listing, sort } = req.query;
        const limit = 10;
        const currentPage = parseInt(page) || 1;

        // Base query for admin table: hide only soft-deleted products.
        let query = { isDeleted: { $ne: true } };

        // Search by title or SKU
        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { sku: { $regex: search, $options: 'i' } }
            ];
        }

        const categories = await Category.find({ isDeleted: { $ne: true } }).sort({ name: 1 }).lean();

        // Filters
        if (category) {
            if (/^[a-f\d]{24}$/i.test(category)) {
                query.category = category;
            } else {
                // Backward compatibility for name-based query values.
                const categoryDoc = categories.find((cat) => cat.name === category);
                query.category = categoryDoc ? categoryDoc._id : null;
            }
        }
        if (brand) {
            query.brand = brand;
        }
        if (connectionType) {
            query.connectionType = connectionType;
        }
        if (listing === 'listed') {
            query.isListed = true;
        } else if (listing === 'unlisted') {
            query.isListed = false;
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
            .populate('category', 'name') // Populate category
            .sort(sortObj)
            .skip(skip)
            .limit(limit);

        for (const product of products) {
            await migrateLegacyProductImages(product);
        }

        // Transform products for view (map category object back to name string for UI consistency)
        const productsForView = products.map(p => {
            const pObj = p.toObject();
            if (pObj.category && pObj.category.name) {
                pObj.category = pObj.category.name;
            } else {
                pObj.category = 'Uncategorized';
            }
            return pObj;
        });

        // Get listed brands for filter dropdown
        const brands = await Brand.find({ isDeleted: { $ne: true }, isActive: true }).sort({ name: 1 });

        res.render('admin/admin-products', {
            products: productsForView,
            brands,
            categories,
            search: search || '',
            filters: {
                category: category || '',
                brand: brand || '',
                connectionType: connectionType || '',
                listing: listing || ''
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
            categories: [],
            search: '',
            filters: { category: '', brand: '', connectionType: '', listing: '' },
            currentSort: 'newest',
            error: 'Failed to load products. Please try again.',
            pagination: { currentPage: 1, totalPages: 0, totalProducts: 0, hasNextPage: false, hasPrevPage: false }
        });
    }
};

// @desc    Soft delete products (set isDeleted = true)
// @route   POST /admin/products/soft-delete
const softDeleteProducts = async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, message: 'No products selected' });
        }
        await Product.updateMany({ _id: { $in: ids } }, { isDeleted: true });
        return res.json({ success: true, message: `${ids.length} product(s) deleted successfully` });
    } catch (error) {
        console.error('Error soft deleting products:', error);
        return res.status(500).json({ success: false, message: 'Failed to delete products' });
    }
};

// @desc    Soft delete a single product (set isDeleted = true)
// @route   DELETE /admin/products/:id
const softDeleteProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }
        product.isDeleted = true;
        await product.save();
        return res.json({ success: true, message: 'Product deleted successfully' });
    } catch (error) {
        console.error('Error soft deleting product:', error);
        return res.status(500).json({ success: false, message: 'Failed to delete product' });
    }
};

// @desc    Get Product Detail Page
// @route   GET /admin/products/:id
const getProductDetailPage = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id)
            .populate('brand', 'name')
            .populate('category', 'name'); // Populate category

        if (!product) {
            return res.redirect('/admin/products');
        }

        await migrateLegacyProductImages(product);

        // Transform for view
        const productForView = product.toObject();
        if (productForView.category && productForView.category.name) {
            productForView.category = productForView.category.name;
        }

        res.render('admin/admin-product-detail', { product: productForView });
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
        const categories = await Category.find({ isDeleted: { $ne: true }, isBlocked: { $ne: true } }).sort({ name: 1 }).lean();
        res.render('admin/admin-add-product', { brands, categories });
    } catch (error) {
        console.error('Error loading add product page:', error);
        res.render('admin/admin-add-product', { brands: [], categories: [] });
    }
};

// @desc    Get Edit Product Page (pre-filled)
// @route   GET /admin/products/edit/:id
const getEditProductPage = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id)
            .populate('brand', 'name')
            .populate('category', 'name'); // Populate category

        if (!product) {
            return res.redirect('/admin/products');
        }

        await migrateLegacyProductImages(product);

        const brands = await Brand.find({ isDeleted: { $ne: true }, isActive: true }).sort({ name: 1 });
        const categories = await Category.find({ isDeleted: { $ne: true }, isBlocked: { $ne: true } }).sort({ name: 1 }).lean();

        // Transform for view
        const productForView = product.toObject();
        if (productForView.category && productForView.category.name) {
            productForView.category = productForView.category.name;
        }

        res.render('admin/admin-edit-product', { product: productForView, brands, categories });
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
            reservedCount, reorderThreshold,
            cableLength, connectorType, impedance, driverSize,
            bluetoothVersion, batteryLife, chargingTime, wirelessRange,
            warrantyDuration, warrantyProvider,
            length, width, height, weight,
            metaTitle, metaDescription, badges,
            noiseControlTypes, controlMethods, cableFeatures, smartFeatures,
            compatibleDevices, materials, includedComponents, audioDriverTypes,
            formFactor, earpieceShape, impedanceRange, sensitivityRange,
            hasMicrophone, batteryChargingTime, ambientModeAvailable
        } = req.body;

        const variants = await buildVariantsFromRequest(req);
        if (!variants.length) {
            return res.status(400).json({
                success: false,
                message: 'At least one variant is required.'
            });
        }
        const totalVariantStock = variants.reduce((sum, variant) => sum + (parseInt(variant.stockCount, 10) || 0), 0);

        // Auto-generate SKU if not provided
        const productSku = sku || `SKU-${Date.now()}`;

        if (!category) {
            return res.status(400).json({ success: false, message: 'Invalid Category' });
        }

        const categoryId = category;


        const product = new Product({
            title,
            sku: productSku,
            brand,
            connectionType,
            category: categoryId, // Use ID
            shortDescription: shortDescription || '',
            price: parseFloat(price),
            originalPrice: originalPrice ? parseFloat(originalPrice) : null,
            discountPercentage: discountPercentage ? parseFloat(discountPercentage) : 0,
            stockCount: totalVariantStock,
            reservedCount: parseInt(reservedCount) || 0,
            reorderThreshold: parseInt(reorderThreshold) || 5,
            images: [],
            variants,
            cableLength: cableLength || '',
            connectorType: connectorType || '',
            impedance: impedance || '',
            driverSize: driverSize || '',
            bluetoothVersion: bluetoothVersion || '',
            batteryLife: batteryLife || '',
            chargingTime: chargingTime || '',
            wirelessRange: wirelessRange || '',
            warranty: {
                duration: warrantyDuration || 'No Warranty',
                provider: warrantyProvider || 'Brand'
            },
            noiseControlTypes: normalizeArrayEnum(noiseControlTypes, ENUM_MAP.noiseControlTypes),
            controlMethods: normalizeArrayEnum(controlMethods, ENUM_MAP.controlMethods),
            cableFeatures: normalizeArrayEnum(cableFeatures, ENUM_MAP.cableFeatures),
            smartFeatures: normalizeArrayEnum(smartFeatures, ENUM_MAP.smartFeatures),
            compatibleDevices: normalizeArrayEnum(compatibleDevices, ENUM_MAP.compatibleDevices),
            materials: normalizeArrayEnum(materials, ENUM_MAP.materials),
            includedComponents: normalizeArrayEnum(includedComponents, ENUM_MAP.includedComponents),
            audioDriverTypes: normalizeArrayEnum(audioDriverTypes, ENUM_MAP.audioDriverTypes),
            formFactor: formFactor || null,
            earpieceShape: normalizeSingleEnum(earpieceShape, ENUM_MAP.earpieceShape),
            impedanceRange: normalizeSingleEnum(impedanceRange, ENUM_MAP.impedanceRange),
            sensitivityRange: normalizeSingleEnum(sensitivityRange, ENUM_MAP.sensitivityRange),
            hasMicrophone: parseBooleanLike(hasMicrophone),
            ambientModeAvailable: parseBooleanLike(ambientModeAvailable),
            batteryChargingTime: batteryChargingTime ? parseFloat(batteryChargingTime) : null,
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
            reservedCount, reorderThreshold,
            cableLength, connectorType, impedance, driverSize,
            bluetoothVersion, batteryLife, chargingTime, wirelessRange,
            warrantyDuration, warrantyProvider,
            length, width, height, weight,
            metaTitle, metaDescription, badges,
            hasVariants,
            noiseControlTypes, controlMethods, cableFeatures, smartFeatures,
            compatibleDevices, materials, includedComponents, audioDriverTypes,
            formFactor, earpieceShape, impedanceRange, sensitivityRange,
            hasMicrophone, batteryChargingTime, ambientModeAvailable
        } = req.body;

        await migrateLegacyProductImages(product);
        const variantsEnabled = String(hasVariants || '').toLowerCase() === 'true';
        const variants = variantsEnabled ? await buildVariantsFromRequest(req, product.variants || []) : [];
        if (!variants.length) {
            return res.status(400).json({
                success: false,
                message: 'At least one variant is required.'
            });
        }
        const totalVariantStock = variants.reduce((sum, variant) => sum + (parseInt(variant.stockCount, 10) || 0), 0);

        // Find Category ID
        let categoryId = product.category;
        if (category) {
            const categoryDoc = await Category.findOne({ name: category, isDeleted: { $ne: true }, isBlocked: { $ne: true } });
            if (categoryDoc) categoryId = categoryDoc._id;
        }

        // Update product fields
        product.title = title;
        product.sku = sku || product.sku;
        product.brand = brand;
        product.connectionType = connectionType;
        product.category = categoryId; // Use ID
        product.shortDescription = shortDescription || '';
        product.price = parseFloat(price);
        product.originalPrice = originalPrice ? parseFloat(originalPrice) : null;
        product.discountPercentage = discountPercentage ? parseFloat(discountPercentage) : 0;
        product.stockCount = totalVariantStock;
        product.reservedCount = parseInt(reservedCount) || 0;
        product.reorderThreshold = parseInt(reorderThreshold) || 5;
        product.images = [];
        product.markModified('images');
        product.cableLength = cableLength || '';
        product.connectorType = connectorType || '';
        product.impedance = impedance || '';
        product.driverSize = driverSize || '';
        product.bluetoothVersion = bluetoothVersion || '';
        product.batteryLife = batteryLife || '';
        product.chargingTime = chargingTime || '';
        product.wirelessRange = wirelessRange || '';
        product.warranty = {
            duration: warrantyDuration || 'No Warranty',
            provider: warrantyProvider || 'Brand'
        };
        product.noiseControlTypes = normalizeArrayEnum(noiseControlTypes, ENUM_MAP.noiseControlTypes);
        product.controlMethods = normalizeArrayEnum(controlMethods, ENUM_MAP.controlMethods);
        product.cableFeatures = normalizeArrayEnum(cableFeatures, ENUM_MAP.cableFeatures);
        product.smartFeatures = normalizeArrayEnum(smartFeatures, ENUM_MAP.smartFeatures);
        product.compatibleDevices = normalizeArrayEnum(compatibleDevices, ENUM_MAP.compatibleDevices);
        product.materials = normalizeArrayEnum(materials, ENUM_MAP.materials);
        product.includedComponents = normalizeArrayEnum(includedComponents, ENUM_MAP.includedComponents);
        product.audioDriverTypes = normalizeArrayEnum(audioDriverTypes, ENUM_MAP.audioDriverTypes);
        product.formFactor = formFactor || null;
        product.earpieceShape = normalizeSingleEnum(earpieceShape, ENUM_MAP.earpieceShape);
        product.impedanceRange = normalizeSingleEnum(impedanceRange, ENUM_MAP.impedanceRange);
        product.sensitivityRange = normalizeSingleEnum(sensitivityRange, ENUM_MAP.sensitivityRange);
        product.hasMicrophone = parseBooleanLike(hasMicrophone);
        product.ambientModeAvailable = parseBooleanLike(ambientModeAvailable);
        product.batteryChargingTime = batteryChargingTime ? parseFloat(batteryChargingTime) : null;
        product.length = length ? parseFloat(length) : null;
        product.width = width ? parseFloat(width) : null;
        product.height = height ? parseFloat(height) : null;
        product.weight = weight ? parseFloat(weight) : null;
        product.metaTitle = metaTitle || '';
        product.metaDescription = metaDescription || '';
        product.badges = badges ? (Array.isArray(badges) ? badges : [badges]) : [];
        const updatedVariants = [];
        const processedVariantIds = new Set();
        variants.forEach((incomingVariant) => {
            if (incomingVariant._id) {
                const variantId = String(incomingVariant._id);
                if (processedVariantIds.has(variantId)) {
                    return;
                }

                const existingVariant = product.variants.id(incomingVariant._id);

                if (existingVariant) {
                    existingVariant.colorName = incomingVariant.colorName;
                    existingVariant.colorCode = incomingVariant.colorCode;
                    existingVariant.stockCount = incomingVariant.stockCount;
                    existingVariant.images = incomingVariant.images;

                    processedVariantIds.add(variantId);
                    updatedVariants.push(existingVariant);
                    return;
                }
            }

            updatedVariants.push({
                colorName: incomingVariant.colorName,
                colorCode: incomingVariant.colorCode,
                stockCount: incomingVariant.stockCount,
                images: incomingVariant.images
            });
        });

        product.variants = updatedVariants;
        product.markModified('variants');

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
        await migrateLegacyProductImages(product);
        return res.status(400).json({ success: false, message: 'Global product images are no longer supported. Use variant images.' });
    } catch (error) {
        console.error('Error deleting product image:', error);
        return res.status(500).json({ success: false, message: 'Failed to delete image' });
    }
};

// @desc    Toggle product listing status
// @route   PATCH /admin/products/:id/toggle-list
const toggleProductListing = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        product.isListed = !product.isListed;
        await product.save();

        return res.json({
            success: true,
            isListed: product.isListed,
            message: product.isListed ? 'Product listed successfully' : 'Product unlisted successfully'
        });
    } catch (error) {
        console.error('Error toggling product listing:', error);
        return res.status(500).json({ success: false, message: 'Failed to toggle product listing' });
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
    deleteProductImage,
    toggleProductListing
};
