const Category = require('../models/Category');
const Product = require('../models/Product');
const cloudinary = require('../config/cloudinary');

function slugify(value) {
    return String(value || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
}

function escapeRegex(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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

// @route GET /admin/categories
exports.getCategoriesPage = async (req, res) => {
    try {
        const { page = 1, search = '' } = req.query;
        const limit = 8;
        const currentPage = parseInt(page, 10) || 1;

        const query = { isDeleted: { $ne: true } };
        if (search) query.name = { $regex: search, $options: 'i' };

        const totalCategories = await Category.countDocuments(query);
        const totalPages = Math.ceil(totalCategories / limit) || 1;
        const skip = (currentPage - 1) * limit;

        const categories = await Category.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        res.render('admin/admin-categories', {
            categories,
            search,
            pagination: {
                currentPage,
                totalPages,
                totalCategories,
                hasNextPage: currentPage < totalPages,
                hasPrevPage: currentPage > 1
            }
        });
    } catch (error) {
        res.render('admin/admin-categories', {
            categories: [],
            search: '',
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
    res.render('admin/categories/add-category', { error: null, errors: {}, oldInput: {} });
};

// @route POST /admin/categories
exports.addCategory = async (req, res) => {
    try {
        const { name, description } = req.body;
        const errors = {};

        if (!name || name.trim().length < 2) {
            errors.name = 'Category name is required (min 2 characters).';
        }

        const normalizedName = String(name || '').trim();
        const existing = await Category.findOne({
            name: { $regex: new RegExp(`^${escapeRegex(normalizedName)}$`, 'i') }
        });

        if (existing && existing.isDeleted !== true) {
            return res.redirect(`/admin/categories/${existing._id}`);
        }

        if (Object.keys(errors).length > 0) {
            return res.render('admin/categories/add-category', {
                error: null,
                errors,
                oldInput: req.body
            });
        }

        const image = getImageData(req.files && req.files.image) || { url: '', public_id: '' };
        const baseSlug = slugify(normalizedName);

        // If a soft-deleted category with the same name exists, restore it.
        if (existing && existing.isDeleted === true) {
            existing.name = normalizedName;
            existing.slug = await buildUniqueSlug(baseSlug, existing._id);
            existing.description = description || existing.description || '';
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
            description: description || '',
            image,
            isBlocked: false,
            isDeleted: false
        });

        return res.redirect('/admin/categories');
    } catch (error) {
        console.error('Add category failed:', error);
        let errorMessage = 'Failed to add category.';

        if (error && error.code === 11000 && error.keyPattern && error.keyPattern.name) {
            errorMessage = 'Category name already exists.';
        } else if (error && error.name === 'MulterError' && error.code === 'LIMIT_FILE_SIZE') {
            errorMessage = 'Image is too large. Maximum allowed size is 4MB.';
        } else if (error && error.message) {
            errorMessage = `Failed to add category: ${error.message}`;
        }

        return res.render('admin/categories/add-category', {
            error: errorMessage,
            errors: {},
            oldInput: req.body
        });
    }
};

// @route GET /admin/categories/:id
exports.getCategoryDetails = async (req, res) => {
    try {
        const category = await Category.findOne({ _id: req.params.id, isDeleted: { $ne: true } }).lean();
        if (!category) return res.redirect('/admin/categories');

        const productCount = await Product.countDocuments({
            category: category._id
        });

        return res.render('admin/category-details', { category, productCount });
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

        const { name, description } = req.body;
        const errors = {};

        if (!name || name.trim().length < 2) {
            errors.name = 'Category name is required (min 2 characters).';
        }

        const existing = await Category.findOne({
            _id: { $ne: req.params.id },
            name: { $regex: new RegExp(`^${escapeRegex(String(name || '').trim())}$`, 'i') },
            isDeleted: { $ne: true }
        }).lean();
        if (existing) errors.name = 'Category name already exists.';

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
        category.description = description || '';

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
