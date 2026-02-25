const mongoose = require('mongoose');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Brand = require('../models/Brand');

function asQueryArray(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (typeof value === 'string' && value.trim()) return [value.trim()];
    return [];
}

async function migrateLegacyProductImages(product) {
    if (!product) return product;
    const variants = Array.isArray(product.variants) ? product.variants : [];
    const images = Array.isArray(product.images) ? product.images : [];
    if (variants.length === 0 && images.length >= 3) {
        product.variants = [{
            colorName: 'Default',
            colorCode: '#000000',
            images: images.map((img) => ({ url: img.url, public_id: img.public_id }))
        }];
        product.images = [];
        product.markModified('variants');
        product.markModified('images');
        await product.save();
    }
    return product;
}

/**
 * @desc    Get all listed products with filtering and sorting (Catalog Page)
 * @route   GET /products
 * @access  Public
 */
exports.getAllProducts = async (req, res) => {
    try {
        const {
            category, brand, connection, minPrice, maxPrice, sort,
            noiseControlTypes, discountRange, hasMicrophone, controlMethods, formFactor,
            cableFeatures, earpieceShape, smartFeatures, newArrivals, sensitivityRange,
            compatibleDevices, materials, impedanceRange, audioDriverTypes, ambientModeAvailable
        } = req.query;
        const activeCategories = await Category.find({ isBlocked: { $ne: true }, isDeleted: { $ne: true } }).lean();
        const allowedCategoryIds = activeCategories.map(c => c._id);

        let filter = { isListed: true, isDeleted: { $ne: true }, category: { $in: allowedCategoryIds } };

        if (category) {
            const categoryIds = asQueryArray(category)
                .filter(id => mongoose.Types.ObjectId.isValid(id))
                .map(id => new mongoose.Types.ObjectId(id));

            if (categoryIds.length > 0) {
                const allowedSet = new Set(allowedCategoryIds.map(String));
                const filteredCategoryIds = categoryIds.filter(id => allowedSet.has(String(id)));
                filter.category = { $in: filteredCategoryIds };
            } else {
                filter._id = null;
            }
        }

        if (brand) {
            const brandIds = asQueryArray(brand)
                .filter(id => mongoose.Types.ObjectId.isValid(id))
                .map(id => new mongoose.Types.ObjectId(id));

            if (brandIds.length > 0) {
                filter.brand = { $in: brandIds };
            } else {
                filter._id = null;
            }
        }

        if (connection) {
            const connections = asQueryArray(connection)
                .map((value) => String(value).trim().toLowerCase())
                .map((value) => value === 'wired' ? 'Wired' : (value === 'wireless' ? 'Wireless' : null))
                .filter(Boolean);
            if (connections.length > 0) {
                filter.connectionType = { $in: connections };
            } else {
                filter._id = null;
            }
        }

        if (minPrice && maxPrice && Number(minPrice) >= Number(maxPrice)) {
            const [, brands, allFilterProducts] = await Promise.all([
                Category.find({ isBlocked: { $ne: true }, isDeleted: { $ne: true } }).lean(),
                Brand.find({ isActive: true, isDeleted: false }).lean(),
                Product.find({ isListed: true, isDeleted: { $ne: true }, category: { $in: allowedCategoryIds } }).select('noiseControlTypes controlMethods cableFeatures smartFeatures compatibleDevices materials includedComponents audioDriverTypes formFactor earpieceShape impedanceRange sensitivityRange hasMicrophone ambientModeAvailable discountPercentage createdAt').lean()
            ]);

            const collect = (key) => [...new Set(allFilterProducts.flatMap((p) => Array.isArray(p[key]) ? p[key] : []).filter(Boolean))];
            const collectSingle = (key) => [...new Set(allFilterProducts.map((p) => p[key]).filter(Boolean))];
            const filterOptions = {
                noiseControlTypes: collect('noiseControlTypes'),
                controlMethods: collect('controlMethods'),
                cableFeatures: collect('cableFeatures'),
                smartFeatures: collect('smartFeatures'),
                compatibleDevices: collect('compatibleDevices'),
                materials: collect('materials'),
                includedComponents: collect('includedComponents'),
                audioDriverTypes: collect('audioDriverTypes'),
                formFactor: collectSingle('formFactor'),
                earpieceShape: collectSingle('earpieceShape'),
                impedanceRange: collectSingle('impedanceRange'),
                sensitivityRange: collectSingle('sensitivityRange'),
                hasMicrophone: allFilterProducts.some((p) => p.hasMicrophone === true),
                hasAmbientMode: allFilterProducts.some((p) => p.ambientModeAvailable === true)
            };

            return res.render('user/products', {
                title: 'Products',
                products: [],
                filters: req.query,
                categories: activeCategories,
                brands,
                query: req.query,
                error: 'Maximum price must be greater than minimum price.',
                filterOptions
            });
        }

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

        const noiseValues = asQueryArray(noiseControlTypes);
        if (noiseValues.length > 0) filter.noiseControlTypes = { $in: noiseValues };

        const controlValues = asQueryArray(controlMethods);
        if (controlValues.length > 0) filter.controlMethods = { $in: controlValues };

        const cableValues = asQueryArray(cableFeatures);
        if (cableValues.length > 0) filter.cableFeatures = { $in: cableValues };

        const smartValues = asQueryArray(smartFeatures);
        if (smartValues.length > 0) filter.smartFeatures = { $in: smartValues };

        const compatibleValues = asQueryArray(compatibleDevices);
        if (compatibleValues.length > 0) filter.compatibleDevices = { $in: compatibleValues };

        const materialValues = asQueryArray(materials);
        if (materialValues.length > 0) filter.materials = { $in: materialValues };

        const driverValues = asQueryArray(audioDriverTypes);
        if (driverValues.length > 0) filter.audioDriverTypes = { $in: driverValues };

        const formValues = asQueryArray(formFactor);
        if (formValues.length > 0) filter.formFactor = { $in: formValues };

        const shapeValues = asQueryArray(earpieceShape);
        if (shapeValues.length > 0) filter.earpieceShape = { $in: shapeValues };

        const sensitivityValues = asQueryArray(sensitivityRange);
        if (sensitivityValues.length > 0) filter.sensitivityRange = { $in: sensitivityValues };

        const impedanceValues = asQueryArray(impedanceRange);
        if (impedanceValues.length > 0) filter.impedanceRange = { $in: impedanceValues };

        const micValues = asQueryArray(hasMicrophone);
        if (micValues.length > 0) {
            const micBool = micValues.map((v) => String(v).toLowerCase()).includes('true');
            filter.hasMicrophone = micBool;
        }

        const ambientValues = asQueryArray(ambientModeAvailable);
        if (ambientValues.length > 0) {
            const ambientBool = ambientValues.map((v) => String(v).toLowerCase()).includes('true');
            filter.ambientModeAvailable = ambientBool;
        }

        const discountValues = asQueryArray(discountRange)
            .map((v) => parseInt(v, 10))
            .filter((v) => [25, 50, 75].includes(v));
        if (discountValues.length > 0) {
            filter.discountPercentage = { $lte: Math.max(...discountValues) };
        }

        const arrivalValues = asQueryArray(newArrivals).map((v) => parseInt(v, 10)).filter((v) => [30, 90].includes(v));
        if (arrivalValues.length > 0) {
            const days = Math.min(...arrivalValues);
            const since = new Date();
            since.setDate(since.getDate() - days);
            filter.createdAt = { $gte: since };
        }

        const productDocs = await Product.find(filter).sort(sortOption);
        for (const productDoc of productDocs) {
            await migrateLegacyProductImages(productDoc);
        }
        const products = productDocs.map((doc) => doc.toObject());

        const [brands, allFilterProducts] = await Promise.all([
            Brand.find({ isActive: true, isDeleted: false }).lean(),
            Product.find({ isListed: true, isDeleted: { $ne: true }, category: { $in: allowedCategoryIds } })
                .select('noiseControlTypes controlMethods cableFeatures smartFeatures compatibleDevices materials includedComponents audioDriverTypes formFactor earpieceShape impedanceRange sensitivityRange hasMicrophone ambientModeAvailable discountPercentage createdAt')
                .lean()
        ]);
        const collect = (key) => [...new Set(allFilterProducts.flatMap((p) => Array.isArray(p[key]) ? p[key] : []).filter(Boolean))];
        const collectSingle = (key) => [...new Set(allFilterProducts.map((p) => p[key]).filter(Boolean))];
        const hasDiscount = allFilterProducts.some((p) => Number(p.discountPercentage) > 0);
        const has30Day = allFilterProducts.some((p) => {
            const d = new Date();
            d.setDate(d.getDate() - 30);
            return p.createdAt && new Date(p.createdAt) >= d;
        });
        const has90Day = allFilterProducts.some((p) => {
            const d = new Date();
            d.setDate(d.getDate() - 90);
            return p.createdAt && new Date(p.createdAt) >= d;
        });
        const filterOptions = {
            noiseControlTypes: collect('noiseControlTypes'),
            controlMethods: collect('controlMethods'),
            cableFeatures: collect('cableFeatures'),
            smartFeatures: collect('smartFeatures'),
            compatibleDevices: collect('compatibleDevices'),
            materials: collect('materials'),
            includedComponents: collect('includedComponents'),
            audioDriverTypes: collect('audioDriverTypes'),
            formFactor: collectSingle('formFactor'),
            earpieceShape: collectSingle('earpieceShape'),
            impedanceRange: collectSingle('impedanceRange'),
            sensitivityRange: collectSingle('sensitivityRange'),
            hasMicrophone: allFilterProducts.some((p) => p.hasMicrophone === true),
            hasAmbientMode: allFilterProducts.some((p) => p.ambientModeAvailable === true),
            discountRanges: hasDiscount ? [25, 50, 75] : [],
            newArrivals: [has30Day ? 30 : null, has90Day ? 90 : null].filter(Boolean)
        };

        res.render('user/products', {
            title: 'Products',
            products,
            filters: req.query,
            categories: activeCategories,
            brands,
            query: req.query,
            filterOptions
        });

    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).render('error', {
            message: 'Error loading products',
            user: req.user
        });
    }
};

/**
 * @desc    Get single product details
 * @route   GET /product/:id
 * @access  Public
 */
exports.getProductDetails = async (req, res) => {
    try {
        const productId = req.params.id;
        const homeUrl = req.session && req.session.userId ? '/home' : '/';
        const activeCategories = await Category.find({ isBlocked: { $ne: true }, isDeleted: { $ne: true } }).select('_id').lean();
        const allowedCategoryIds = activeCategories.map(c => c._id);
        const allowedCategorySet = new Set(allowedCategoryIds.map(String));

        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(404).render('user/product-unavailable', { homeUrl });
        }

        // Fetch Product
        const product = await Product.findById(productId)
            .populate('brand', 'name')
            .populate('category', 'name isBlocked isDeleted');

        if (!product || product.isListed === false || product.isDeleted === true || !product.category || !allowedCategorySet.has(String(product.category._id || product.category))) {
            return res.status(404).render('user/product-unavailable', { homeUrl });
        }

        await migrateLegacyProductImages(product);

        // Get Similar Products (Same connection type, excluding current)
        const relatedDocs = await Product.find({
            _id: { $ne: product._id },
            connectionType: product.connectionType,
            isDeleted: { $ne: true },
            isListed: true
        })
            .sort({ createdAt: -1 })
            .limit(6);
        for (const rel of relatedDocs) {
            await migrateLegacyProductImages(rel);
        }
        const relatedProducts = relatedDocs.map((doc) => doc.toObject());

        // Get "Customers Also Bought" (Latest products, excluding current)
        const alsoBoughtDocs = await Product.find({
            _id: { $ne: product._id },
            isDeleted: { $ne: true },
            isListed: true
        })
            .sort({ createdAt: -1 })
            .limit(6);
        for (const ab of alsoBoughtDocs) {
            await migrateLegacyProductImages(ab);
        }
        const alsoBought = alsoBoughtDocs.map((doc) => doc.toObject());

        res.render('user/product-details', {
            title: product.title,
            product: product.toObject(),
            relatedProducts,
            alsoBought
        });

    } catch (error) {
        console.error('Error fetching product details:', error);
        const homeUrl = req.session && req.session.userId ? '/home' : '/';
        res.status(500).render('user/product-unavailable', { homeUrl });
    }
};
