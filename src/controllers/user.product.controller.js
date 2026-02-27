const mongoose = require('mongoose');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Brand = require('../models/Brand');

function asQueryArray(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (typeof value === 'string' && value.trim()) return [value.trim()];
    return [];
}

function asSingleQueryValue(value) {
    const values = asQueryArray(value);
    return values.length > 0 ? values[0] : null;
}

function getArrayEnumValues(pathName) {
    const schemaPath = Product.schema.path(pathName);
    if (!schemaPath) return [];

    const enumSource =
        schemaPath.embeddedSchemaType?.enumValues ||
        schemaPath.caster?.enumValues;

    return Array.isArray(enumSource)
        ? enumSource.filter(Boolean)
        : [];
}

function getSingleEnumValues(pathName) {
    const schemaPath = Product.schema.path(pathName);
    return schemaPath && Array.isArray(schemaPath.enumValues)
        ? schemaPath.enumValues.filter(Boolean)
        : [];
}

const ENUM_FILTER_OPTIONS = {
    noiseControlTypes: getArrayEnumValues('noiseControlTypes'),
    controlMethods: getArrayEnumValues('controlMethods'),
    cableFeatures: getArrayEnumValues('cableFeatures'),
    smartFeatures: getArrayEnumValues('smartFeatures'),
    compatibleDevices: getArrayEnumValues('compatibleDevices'),
    materials: getArrayEnumValues('materials'),
    audioDriverTypes: getArrayEnumValues('audioDriverTypes'),
    formFactor: getSingleEnumValues('formFactor'),
    earpieceShape: getSingleEnumValues('earpieceShape'),
    impedanceRange: getSingleEnumValues('impedanceRange'),
    sensitivityRange: getSingleEnumValues('sensitivityRange')
};

const FORM_FACTORS_BY_CONNECTION = {
    Wired: ['In-Ear', 'In-Ear (Earbuds/IEMs)', 'Over-Ear', 'On-Ear', 'Clip-On', 'Ear Hooks'],
    Wireless: ['True Wireless (TWS)', 'Neckband', 'Over-Ear', 'On-Ear', 'Bone Conduction', 'Ear Hooks']
};

const DISCOUNT_RANGES = [
    { value: '0-25', min: 0, max: 25, label: '0-25%' },
    { value: '25-50', min: 25, max: 50, label: '25-50%' },
    { value: '50-75', min: 50, max: 75, label: '50-75%' },
    { value: '75-99', min: 75, max: 100, label: '75-99%' }
];

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
            search,
            category, brand, connection, minPrice, maxPrice, sort,
            noiseControlTypes, discountRange, hasMicrophone, controlMethods, formFactor,
            cableFeatures, earpieceShape, smartFeatures, newArrivals, sensitivityRange,
            compatibleDevices, materials, impedanceRange, audioDriverTypes, ambientModeAvailable, colors
        } = req.query;
        const searchTerm = typeof search === 'string' ? search.trim() : '';
        const page = parseInt(req.query.page, 10) || 1;
        const limit = 15;
        const skip = (page - 1) * limit;
        const activeCategories = await Category.find({ isBlocked: { $ne: true }, isDeleted: { $ne: true } }).lean();
        const allowedCategoryIds = activeCategories.map(c => c._id);
        const allowedCategorySet = new Set(allowedCategoryIds.map(String));
        const filter = {
            isListed: true,
            isDeleted: { $ne: true },
            category: { $in: allowedCategoryIds }
        };

        const categoryIds = asQueryArray(category)
            .filter(id => mongoose.Types.ObjectId.isValid(id))
            .map(id => new mongoose.Types.ObjectId(id))
            .filter(id => allowedCategorySet.has(String(id)));
        if (asQueryArray(category).length > 0) {
            if (categoryIds.length > 0) filter.category = { $in: categoryIds };
            else filter._id = null;
        }

        const brandIds = asQueryArray(brand)
            .filter(id => mongoose.Types.ObjectId.isValid(id))
            .map(id => new mongoose.Types.ObjectId(id));
        if (asQueryArray(brand).length > 0) {
            if (brandIds.length > 0) filter.brand = { $in: brandIds };
            else filter._id = null;
        }

        const selectedConnection = asSingleQueryValue(connection);
        if (selectedConnection && ['Wired', 'Wireless'].includes(selectedConnection)) {
            filter.connectionType = selectedConnection;
        } else if (selectedConnection) {
            filter._id = null;
        }

        const minPriceNumber = minPrice !== undefined && minPrice !== '' ? Number(minPrice) : null;
        const maxPriceNumber = maxPrice !== undefined && maxPrice !== '' ? Number(maxPrice) : null;
        if (minPriceNumber !== null || maxPriceNumber !== null) {
            filter.price = {};
            if (minPriceNumber !== null && !Number.isNaN(minPriceNumber)) {
                filter.price.$gte = minPriceNumber;
            }
            if (maxPriceNumber !== null && !Number.isNaN(maxPriceNumber)) {
                filter.price.$lte = maxPriceNumber;
            }
            if (Object.keys(filter.price).length === 0) {
                delete filter.price;
            }
        }

        if (
            minPriceNumber !== null && maxPriceNumber !== null &&
            !Number.isNaN(minPriceNumber) && !Number.isNaN(maxPriceNumber) &&
            maxPriceNumber < minPriceNumber
        ) {
            const [brands, variantColors] = await Promise.all([
                Brand.find({ isActive: true, isDeleted: false }).lean(),
                Product.distinct('variants.colorName', {
                    isListed: true,
                    isDeleted: { $ne: true },
                    category: { $in: allowedCategoryIds }
                })
            ]);
            const normalizedVariantColors = variantColors
                .map((value) => String(value || '').trim())
                .filter(Boolean)
                .sort((a, b) => a.localeCompare(b));
            return res.render('user/products', {
                title: 'Products',
                products: [],
                filters: req.query,
                categories: activeCategories,
                brands,
                query: req.query,
                search: searchTerm,
                currentSort: sort || 'newest',
                pagination: {
                    currentPage: page,
                    totalPages: 1,
                    totalItems: 0,
                    hasPrevPage: false,
                    hasNextPage: false
                },
                error: 'Maximum price must be greater than or equal to minimum price.',
                filterOptions: {
                    ...ENUM_FILTER_OPTIONS,
                    formFactorsByConnection: FORM_FACTORS_BY_CONNECTION,
                    discountRanges: DISCOUNT_RANGES,
                    newArrivals: [30, 90],
                    hasMicrophone: true,
                    hasAmbientMode: true,
                    variantColors: normalizedVariantColors
                }
            });
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

        const noiseValues = asQueryArray(noiseControlTypes).filter((value) => ENUM_FILTER_OPTIONS.noiseControlTypes.includes(value));
        if (noiseValues.length > 0) filter.noiseControlTypes = { $in: noiseValues };

        const controlValues = asQueryArray(controlMethods).filter((value) => ENUM_FILTER_OPTIONS.controlMethods.includes(value));
        if (controlValues.length > 0) filter.controlMethods = { $in: controlValues };

        const cableValues = asQueryArray(cableFeatures).filter((value) => ENUM_FILTER_OPTIONS.cableFeatures.includes(value));
        if (cableValues.length > 0) filter.cableFeatures = { $in: cableValues };

        const smartValues = asQueryArray(smartFeatures).filter((value) => ENUM_FILTER_OPTIONS.smartFeatures.includes(value));
        if (smartValues.length > 0) filter.smartFeatures = { $in: smartValues };

        const compatibleValues = asQueryArray(compatibleDevices).filter((value) => ENUM_FILTER_OPTIONS.compatibleDevices.includes(value));
        if (compatibleValues.length > 0) filter.compatibleDevices = { $in: compatibleValues };

        const materialValues = asQueryArray(materials).filter((value) => ENUM_FILTER_OPTIONS.materials.includes(value));
        if (materialValues.length > 0) filter.materials = { $in: materialValues };

        const driverValues = asQueryArray(audioDriverTypes).filter((value) => ENUM_FILTER_OPTIONS.audioDriverTypes.includes(value));
        if (driverValues.length > 0) filter.audioDriverTypes = { $in: driverValues };

        const selectedFormFactor = asSingleQueryValue(formFactor);
        if (selectedFormFactor) {
            const allowedFormFactors = selectedConnection && FORM_FACTORS_BY_CONNECTION[selectedConnection]
                ? FORM_FACTORS_BY_CONNECTION[selectedConnection]
                : ENUM_FILTER_OPTIONS.formFactor;
            if (allowedFormFactors.includes(selectedFormFactor)) {
                filter.formFactor = selectedFormFactor;
            } else {
                filter._id = null;
            }
        }

        const selectedEarpieceShape = asSingleQueryValue(earpieceShape);
        if (selectedEarpieceShape && ENUM_FILTER_OPTIONS.earpieceShape.includes(selectedEarpieceShape)) {
            filter.earpieceShape = selectedEarpieceShape;
        }

        const selectedSensitivityRange = asSingleQueryValue(sensitivityRange);
        if (selectedSensitivityRange && ENUM_FILTER_OPTIONS.sensitivityRange.includes(selectedSensitivityRange)) {
            filter.sensitivityRange = selectedSensitivityRange;
        }

        const selectedImpedanceRange = asSingleQueryValue(impedanceRange);
        if (selectedImpedanceRange && ENUM_FILTER_OPTIONS.impedanceRange.includes(selectedImpedanceRange)) {
            filter.impedanceRange = selectedImpedanceRange;
        }

        const micValues = asQueryArray(hasMicrophone);
        if (micValues.length > 0) {
            const micBool = micValues.map((v) => String(v).toLowerCase()).includes('true');
            if (micBool) filter.hasMicrophone = true;
        }

        const ambientValues = asQueryArray(ambientModeAvailable);
        if (ambientValues.length > 0) {
            const ambientBool = ambientValues.map((v) => String(v).toLowerCase()).includes('true');
            if (ambientBool) filter.ambientModeAvailable = true;
        }

        const selectedDiscountRange = asSingleQueryValue(discountRange);
        const matchedDiscountRange = DISCOUNT_RANGES.find((range) => range.value === selectedDiscountRange);
        if (matchedDiscountRange) {
            filter.discountPercentage = { $gte: matchedDiscountRange.min, $lt: matchedDiscountRange.max };
        }

        const selectedNewArrivalDays = parseInt(asSingleQueryValue(newArrivals), 10);
        if ([30, 90].includes(selectedNewArrivalDays)) {
            const since = new Date();
            since.setDate(since.getDate() - selectedNewArrivalDays);
            filter.createdAt = { $gte: since };
        }

        const colorValues = asQueryArray(colors).map((value) => String(value).trim()).filter(Boolean);
        if (colorValues.length > 0) {
            filter['variants.colorName'] = { $in: colorValues };
        }

        if (searchTerm.length >= 2) {
            const escapedSearch = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escapedSearch, 'i');

            const [matchingBrands, matchingCategories] = await Promise.all([
                Brand.find({ name: regex }).select('_id').lean(),
                Category.find({
                    name: regex,
                    isBlocked: { $ne: true },
                    isDeleted: { $ne: true }
                }).select('_id').lean()
            ]);

            filter.$or = [
                { title: regex },
                { connectionType: regex },
                { brand: { $in: matchingBrands.map((b) => b._id) } },
                { category: { $in: matchingCategories.map((c) => c._id) } }
            ];
        }

        const totalProducts = await Product.countDocuments(filter);
        const productDocs = await Product.find(filter)
            .sort(sortOption)
            .skip(skip)
            .limit(limit);
        for (const productDoc of productDocs) {
            await migrateLegacyProductImages(productDoc);
        }
        const products = productDocs.map((doc) => doc.toObject());
        const totalPages = Math.max(1, Math.ceil(totalProducts / limit));
        const pagination = {
            currentPage: page,
            totalPages,
            totalItems: totalProducts,
            hasPrevPage: page > 1,
            hasNextPage: page < totalPages
        };

        const [brands, variantColors] = await Promise.all([
            Brand.find({ isActive: true, isDeleted: false }).lean(),
            Product.distinct('variants.colorName', {
                isListed: true,
                isDeleted: { $ne: true },
                category: { $in: allowedCategoryIds }
            })
        ]);
        const normalizedVariantColors = variantColors
            .map((value) => String(value || '').trim())
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b));
        const filterOptions = {
            ...ENUM_FILTER_OPTIONS,
            formFactorsByConnection: FORM_FACTORS_BY_CONNECTION,
            discountRanges: DISCOUNT_RANGES,
            newArrivals: [30, 90],
            hasMicrophone: true,
            hasAmbientMode: true,
            variantColors: normalizedVariantColors
        };

        res.render('user/products', {
            title: 'Products',
            products,
            filters: req.query,
            categories: activeCategories,
            brands,
            query: req.query,
            search: searchTerm,
            filterOptions,
            currentSort: sort || 'newest',
            pagination
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

exports.liveSearch = async (req, res) => {
    try {
        const query = (req.query.query || '').trim();
        if (!query || query.length < 2) {
            return res.json([]);
        }

        const regex = new RegExp(query, 'i');

        const matchingBrands = await Brand.find({ name: regex }).select('_id').lean();
        const matchingCategories = await Category.find({ name: regex }).select('_id').lean();

        const products = await Product.find({
            isListed: true,
            isDeleted: { $ne: true },
            $or: [
                { title: regex },
                { connectionType: regex },
                { brand: { $in: matchingBrands.map((b) => b._id) } },
                { category: { $in: matchingCategories.map((c) => c._id) } }
            ]
        })
            .populate('brand', 'name')
            .limit(6)
            .lean();

        const results = products.map((p) => ({
            _id: p._id,
            title: p.title,
            brand: p.brand?.name || '',
            connectionType: p.connectionType,
            thumbnail:
                (p.images && p.images.length && p.images[0].url) ||
                (p.variants?.[0]?.images?.[0]?.url) ||
                ''
        }));

        return res.json(results);
    } catch (err) {
        console.error('Live search error:', err);
        return res.json([]);
    }
};
