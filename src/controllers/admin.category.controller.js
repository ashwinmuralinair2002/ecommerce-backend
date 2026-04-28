const Category = require('../models/Category');
const Product = require('../models/Product');
const Order = require('../models/order.model');
const cloudinary = require('../config/cloudinary');
const AppError = require('../utils/AppError');
const HTTP_STATUS = require('../constants/http-status');
const { slugify } = require('../utils/string.utils');
const { escapeRegex } = require('../utils/validation.utils');

async function buildUniqueSlug(baseSlug, excludeId = null) {
    let slug = baseSlug || `category-${Date.now()}`;
    let i = 1;
    while (true) {
        const query = { slug };
        if (excludeId) query._id = { $ne: excludeId };
        const exists = await Category.findOne(query).select('_id').lean();
        if (!exists) return slug;
        slug = `${baseSlug}-${i++}`;
    }
}

function getImageData(fileEntry) {
    if (!fileEntry || !fileEntry[0]) return null;
    return {
        url: fileEntry[0].path || '',
        public_id: fileEntry[0].filename || ''
    };
}

async function destroyCloudinary(publicId) {
    if (!publicId) return;
    await cloudinary.uploader.destroy(publicId).catch(() => { });
}

const deliveredStatusExpr = {
    $toLower: {
        $ifNull: ['$orderStatus', '$status']
    }
};

const itemRevenueExpression = {
    $ifNull: [
        '$items.finalPrice',
        {
            $multiply: [
                { $ifNull: ['$items.price', 0] },
                { $ifNull: ['$items.quantity', 0] }
            ]
        }
    ]
};

// @route GET /admin/categories
exports.getCategoriesPage = async (req, res) => {
    try {
        const { search = '', status = 'all', sort = 'newest' } = req.query;
        const page = parseInt(req.query.page, 10) || 1;
        const limit = 5;
        const skip = (page - 1) * limit;

        const query = {};
        if (search) query.name = { $regex: search, $options: 'i' };
        if (status === 'listed') {
            query.isBlocked = false;
            query.isDeleted = false;
        } else if (status === 'unlisted') {
            query.isBlocked = true;
            query.isDeleted = false;
        } else {
            query.isDeleted = { $ne: true };
        }

        let sortOption = { createdAt: -1 };
        if (sort === 'oldest') {
            sortOption = { createdAt: 1 };
        }

        const totalCategories = await Category.countDocuments(query);
        const totalPages = Math.ceil(totalCategories / limit) || 1;

        const categories = await Category.find(query)
            .sort(sortOption)
            .skip(skip)
            .limit(limit)
            .lean();
        const categoriesWithProductCount = await Promise.all(
            categories.map(async (category) => ({
                ...category,
                productCount: await Product.countDocuments({ category: category._id })
            }))
        );

        res.render('admin/admin-categories', {
            categories: categoriesWithProductCount,
            search,
            status,
            currentSort: sort,
            pagination: {
                currentPage: page,
                totalPages,
                totalItems: totalCategories,
                totalCategories,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            }
        });
    } catch (error) {
        res.render('admin/admin-categories', {
            categories: [],
            search: '',
            status: 'all',
            currentSort: 'newest',
            pagination: {
                currentPage: 1,
                totalPages: 1,
                totalCategories: 0,
                hasNextPage: false,
                hasPrevPage: false
            },
            error: 'Failed to load categories.'
        });
    }
};

// @route GET /admin/categories/add
exports.renderAddCategory = (req, res) => {
    res.render('admin/categories/add-category', { error: null, errors: {}, oldInput: {}, existingImage: '' });
};

// @route GET /admin/categories/check-name
exports.checkCategoryName = async (req, res) => {
    try {
        const normalizedName = String(req.query.name || '').trim();
        if (!normalizedName) {
            return res.json({ exists: false });
        }

        const existing = await Category.findOne({
            name: { $regex: new RegExp(`^${escapeRegex(normalizedName)}$`, 'i') },
            isDeleted: { $ne: true }
        }).select('_id').lean();

        return res.json({ exists: Boolean(existing) });
    } catch (error) {
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ exists: false });
    }
};

// @route POST /admin/categories
exports.addCategory = async (req, res) => {
    try {
        const uploadedImageUrl = req.file?.path || req.file?.url || '';
        const existingImage = uploadedImageUrl || String(req.body.existingImage || '').trim();

        if (req.uploadValidationError) {
            return res.render('admin/categories/add-category', {
                error: req.uploadValidationError,
                errors: {},
                oldInput: req.body,
                existingImage
            });
        }

        const { name, description } = req.body;
        const errors = {};

        if (!name || name.trim().length < 2) {
            errors.name = 'Category name is required (min 2 characters).';
        }

        if (!description || !description.trim()) {
            errors.description = 'Category description is required.';
        }

        const normalizedName = String(name || '').trim();
        const existing = await Category.findOne({
            name: { $regex: new RegExp(`^${escapeRegex(normalizedName)}$`, 'i') }
        });

        if (existing && existing.isDeleted !== true) {
            errors.name = 'Category name already exists';
        }

        if (!req.file && (!req.files || !Array.isArray(req.files.image) || req.files.image.length === 0) && !existingImage) {
            errors.image = 'Category image is required.';
        }

        if (Object.keys(errors).length > 0) {
            return res.render('admin/categories/add-category', {
                error: null,
                errors,
                oldInput: req.body,
                existingImage
            });
        }

        const image = getImageData(req.files && req.files.image)
            || (existingImage ? { url: existingImage, public_id: '' } : { url: '', public_id: '' });
        const baseSlug = slugify(normalizedName);

        // If a soft-deleted category with the same name exists, restore it.
        if (existing && existing.isDeleted === true) {
            existing.name = normalizedName;
            existing.slug = await buildUniqueSlug(baseSlug, existing._id);
            existing.description = description.trim();
            existing.isDeleted = false;
            existing.isBlocked = false;

            if (image.url) {
                await destroyCloudinary(existing.image && existing.image.public_id);
                existing.image = image;
            }
            await existing.save();
            return res.redirect('/admin/categories');
        }

        const slug = await buildUniqueSlug(baseSlug);
        await Category.create({
            name: normalizedName,
            slug,
            description: description.trim(),
            image,
            isBlocked: false,
            isDeleted: false
        });

        return res.redirect('/admin/categories');
    } catch (error) {
        console.error('Add category failed:', error);
        let errorMessage = 'Failed to add category.';
        const errors = {};

        if (error && error.code === 11000 && error.keyPattern && error.keyPattern.name) {
            errors.name = 'Category name already exists';
            errorMessage = null;
        } else if (error && error.name === 'MulterError' && error.code === 'LIMIT_FILE_SIZE') {
            errorMessage = 'Image is too large. Maximum allowed size is 4MB.';
        } else if (error && error.message) {
            errorMessage = `Failed to add category: ${error.message}`;
        }

        return res.render('admin/categories/add-category', {
            error: errorMessage,
            errors,
            oldInput: req.body,
            existingImage: uploadedImageUrl || String(req.body.existingImage || '').trim()
        });
    }
};

// @route GET /admin/categories/:id
exports.getCategoryDetails = async (req, res) => {
    try {
        const category = await Category.findOne({ _id: req.params.id, isDeleted: { $ne: true } }).lean();
        if (!category) return res.redirect('/admin/categories');

        const [productCount, products, salesData] = await Promise.all([
            Product.countDocuments({
                category: category._id
            }),
            Product.find({
                category: category._id
            }).sort({ createdAt: -1 }).lean(),
            Order.aggregate([
                {
                    $match: {
                        $expr: { $eq: [deliveredStatusExpr, 'delivered'] }
                    }
                },
                { $unwind: '$items' },
                {
                    $match: {
                        'items.productId': { $exists: true, $ne: null }
                    }
                },
                {
                    $lookup: {
                        from: 'products',
                        localField: 'items.productId',
                        foreignField: '_id',
                        as: 'product'
                    }
                },
                { $unwind: '$product' },
                {
                    $match: {
                        'product.category': category._id
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalUnitsSold: {
                            $sum: { $ifNull: ['$items.quantity', 0] }
                        },
                        totalRevenue: {
                            $sum: itemRevenueExpression
                        }
                    }
                }
            ])
        ]);

        const metrics = {
            totalProducts: productCount,
            totalUnitsSold: Number(salesData[0]?.totalUnitsSold || 0),
            totalRevenue: Number(salesData[0]?.totalRevenue || 0)
        };

        return res.render('admin/category-details', { category, productCount, products, metrics });
    } catch (error) {
        return res.redirect('/admin/categories');
    }
};

// @route GET /admin/categories/:id/edit
exports.renderEditCategory = async (req, res) => {
    try {
        const category = await Category.findOne({ _id: req.params.id, isDeleted: { $ne: true } }).lean();
        if (!category) return res.redirect('/admin/categories');

        return res.render('admin/categories/edit-category', {
            category,
            error: null,
            errors: {},
            oldInput: null
        });
    } catch (error) {
        return res.redirect('/admin/categories');
    }
};

// @route POST /admin/categories/:id/edit
exports.editCategory = async (req, res) => {
    try {
        const category = await Category.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
        if (!category) return res.redirect('/admin/categories');

        if (req.uploadValidationError) {
            return res.render('admin/categories/edit-category', {
                category: category.toObject(),
                error: req.uploadValidationError,
                errors: {},
                oldInput: req.body
            });
        }

        const { name, description } = req.body;
        const errors = {};

        if (!name || name.trim().length < 2) {
            errors.name = 'Category name is required (min 2 characters).';
        }

        if (!description || !description.trim()) {
            errors.description = 'Category description is required.';
        }

        const existing = await Category.findOne({
            _id: { $ne: req.params.id },
            name: { $regex: new RegExp(`^${escapeRegex(String(name || '').trim())}$`, 'i') },
            isDeleted: { $ne: true }
        }).lean();
        if (existing) errors.name = 'Category name already exists.';

        const hasUploadedImage = req.file || (req.files && Array.isArray(req.files.image) && req.files.image.length > 0);
        const hasExistingImage = Boolean(category.image && category.image.url);
        if (!hasUploadedImage && !hasExistingImage) {
            errors.image = 'Category image is required.';
        }

        if (Object.keys(errors).length > 0) {
            return res.render('admin/categories/edit-category', {
                category: category.toObject(),
                error: null,
                errors,
                oldInput: req.body
            });
        }

        category.name = name.trim();
        category.slug = await buildUniqueSlug(slugify(name), category._id);
        category.description = description.trim();

        const image = getImageData(req.files && req.files.image);
        if (image) {
            await destroyCloudinary(category.image && category.image.public_id);
            category.image = image;
        }

        await category.save();
        return res.redirect(`/admin/categories/${category._id}`);
    } catch (error) {
        console.error('Edit category failed:', error);
        let errorMessage = 'Failed to update category.';

        if (error && error.code === 11000 && error.keyPattern && error.keyPattern.name) {
            errorMessage = 'Category name already exists.';
        } else if (error && error.name === 'MulterError' && error.code === 'LIMIT_FILE_SIZE') {
            errorMessage = 'Image is too large. Maximum allowed size is 4MB.';
        } else if (error && error.message) {
            errorMessage = `Failed to update category: ${error.message}`;
        }

        const category = await Category.findById(req.params.id).lean().catch(() => null);
        return res.render('admin/categories/edit-category', {
            category: category || { _id: req.params.id, name: '', description: '', image: {} },
            error: errorMessage,
            errors: {},
            oldInput: req.body
        });
    }
};

// @route POST /admin/categories/:id/block-toggle
exports.toggleCategoryBlock = async (req, res) => {
    try {
        const category = await Category.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
        if (!category) return res.redirect('/admin/categories');

        category.isBlocked = !category.isBlocked;
        await category.save();
        return res.redirect('/admin/categories');
    } catch (error) {
        return res.redirect('/admin/categories');
    }
};

// @route POST /admin/categories/:id/delete
exports.deleteCategory = async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);
        if (!category) return res.redirect('/admin/categories');

        category.isDeleted = true;
        await category.save();
        return res.redirect('/admin/categories');
    } catch (error) {
        return res.redirect('/admin/categories');
    }
};
