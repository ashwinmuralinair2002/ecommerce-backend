// Admin management controller for customer and system operations
const mongoose = require('mongoose');
const Offer = require('../models/offer.model');
const Coupon = require('../models/coupon.model');
const CouponUsage = require('../models/coupon-usage.model');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Brand = require('../models/Brand');
const User = require('../models/user.model');
const Wallet = require('../models/wallet.model');
const WalletTransaction = require('../models/wallet-transaction.model');
const Order = require('../models/order.model');
const { attachOrderIds } = require('./wallet.controller');
const { createOfferSchema } = require('../validators/offer.validator');
const { createCouponSchema, couponValidationRules } = require('../validators/coupon.validator');
const { clearOfferCache } = require('../utils/offer-cache');
const AppError = require('../utils/AppError');
const profileService = require('../services/profile.service');
const { Parser } = require('json2csv');
const bcrypt = require('bcryptjs');

const ENABLE_ADMIN_USER_EDIT = process.env.ENABLE_ADMIN_USER_EDIT === 'true';
const { Types } = mongoose;

const mapIssuesToFields = (issues = []) => {
    return issues.reduce((acc, issue) => {
        const fieldName = Array.isArray(issue.path) && issue.path.length > 0 ? issue.path[0] : 'form';

        if (!acc[fieldName]) {
            acc[fieldName] = issue.message;
        }

        return acc;
    }, {});
};

const normalizeSelectionArray = (value) => {
    if (value == null || value === '') {
        return [];
    }

    return Array.isArray(value) ? value : [value];
};

const normalizeToArray = (val) => {
    if (!val) return [];
    return Array.isArray(val) ? val : [val];
};

const normalizeOfferDataForSave = (data) => {
    if (data.discountType === 'FLAT') {
        data.maxDiscountAmount = null;
    }

    if (data.discountType === 'PERCENTAGE') {
        if (!data.maxDiscountAmount || Number(data.maxDiscountAmount) <= 0) {
            throw new AppError('Max discount amount is required for percentage offers', 400);
        }
    }

    return data;
};

const getApplicableOfferProducts = async (data) => {
    const query = {
        isListed: true,
        isDeleted: false
    };

    if (data.type === 'PRODUCT') {
        query._id = { $in: data.applicableProducts || [] };
    } else if (data.type === 'CATEGORY') {
        query.category = { $in: data.applicableCategories || [] };
    } else if (data.type === 'BRAND') {
        query.brand = { $in: data.applicableBrands || [] };
    } else {
        return [];
    }

    return Product.find(query).select('price').lean();
};

const enforceOfferSafetyRules = async (data) => {
    if (data.discountType !== 'FLAT') {
        return data;
    }

    if (Number(data.discountValue) >= Number(data.minOrderValue)) {
        throw new AppError('Discount must be less than minimum order value', 400);
    }

    const applicableProducts = await getApplicableOfferProducts(data);

    if (applicableProducts.length > 0) {
        const cheapest = Math.min(...applicableProducts.map((product) => Number(product?.price || 0)));

        if (Number(data.discountValue) >= cheapest) {
            throw new AppError('Discount exceeds cheapest product price in selection', 400);
        }
    }

    return data;
};

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toObjectIds = (arr) => (
    normalizeToArray(arr)
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id))
);

const formatDateForInput = (value) => {
    if (!value) return '';
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return '';
    }

    return date.toISOString().split('T')[0];
};

const normalizeAdminDateInput = (value) => {
    if (!value) return '';

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return value;
    }

    const parts = String(value).split('/');

    if (parts.length === 3) {
        const [day, month, year] = parts;
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    return String(value);
};

const normalizeDateToUTC = (dateString, isEnd = false) => {
    if (!dateString) return null;

    const date = new Date(dateString);

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    if (isEnd) {
        date.setHours(23, 59, 59, 999);
    } else {
        date.setHours(0, 0, 0, 0);
    }

    return new Date(date.toISOString());
};

const normalizeCouponDatesForSave = (data) => {
    const normalizedStartDate = normalizeDateToUTC(data.startDate);
    const normalizedEndDate = normalizeDateToUTC(data.endDate, true);
    const now = new Date();

    data.startDate = normalizedStartDate;
    data.endDate = normalizedEndDate;

    if (data.startDate) {
        const start = new Date(data.startDate);
        const rawStartDate = normalizeAdminDateInput(data.rawStartDate || data.startDate);
        const selectedStartDate = rawStartDate ? new Date(rawStartDate) : null;
        const isSameDay = selectedStartDate
            && !Number.isNaN(selectedStartDate.getTime())
            && selectedStartDate.getFullYear() === now.getFullYear()
            && selectedStartDate.getMonth() === now.getMonth()
            && selectedStartDate.getDate() === now.getDate();

        if (isSameDay && start < now) {
            data.startDate = now;
        }
    }

    delete data.rawStartDate;
    delete data.rawEndDate;

    return data;
};

const buildOfferFormState = async ({ errors = [], oldInput = {}, formError = null } = {}) => {
    const [products, categories, brands] = await Promise.all([
        Product.find({ isListed: true, isDeleted: false })
            .select('title price')
            .sort({ title: 1 })
            .lean(),
        Category.find({ isDeleted: false, isBlocked: false })
            .select('name')
            .sort({ name: 1 })
            .lean(),
        Brand.find({ isDeleted: false, isActive: true })
            .select('name')
            .sort({ name: 1 })
            .lean()
    ]);

    const normalizedOldInput = {
        name: oldInput?.name || '',
        type: oldInput?.type || 'PRODUCT',
        discountType: oldInput?.discountType || 'PERCENTAGE',
        discountValue: oldInput?.discountValue || '',
        maxDiscountAmount: oldInput?.maxDiscountAmount ?? oldInput?.maxDiscount ?? '',
        minOrderValue: oldInput?.minOrderValue ?? '',
        applicableProducts: normalizeSelectionArray(oldInput?.applicableProducts),
        applicableCategories: normalizeSelectionArray(oldInput?.applicableCategories),
        applicableBrands: normalizeSelectionArray(oldInput?.applicableBrands),
        startDate: oldInput?.startDate || '',
        endDate: oldInput?.endDate || ''
    };

    return {
        products,
        categories,
        brands,
        errors,
        fieldErrors: mapIssuesToFields(errors),
        oldInput: normalizedOldInput,
        formError
    };
};

const buildOfferFormView = async ({
    errors = [],
    oldInput = {},
    formError = null,
    offer = null,
    formMode = 'create'
} = {}) => {
    const viewModel = await buildOfferFormState({ errors, oldInput, formError });

    return {
        ...viewModel,
        formMode,
        offer,
        formAction: formMode === 'edit' ? `/admin/offers/${offer?._id}?_method=PATCH` : '/admin/offers/create',
        pageTitle: formMode === 'edit' ? 'Edit Offer' : 'Create Offer',
        pageDescription: formMode === 'edit'
            ? 'Update the offer details while keeping the pricing engine in sync.'
            : 'Set up a targeted offer and keep it ready for the pricing engine.',
        submitLabel: formMode === 'edit' ? 'Update Offer' : 'Create Offer'
    };
};

const buildCouponFormView = ({
    errors = [],
    oldInput = {},
    formError = null,
    coupon = null,
    isEditMode = false
} = {}) => {
    const normalizedOldInput = {
        code: oldInput?.code || '',
        discountType: oldInput?.discountType || 'PERCENTAGE',
        discountValue: oldInput?.discountValue || '',
        maxDiscount: oldInput?.maxDiscount || '',
        minOrderValue: oldInput?.minOrderValue ?? '',
        usageLimit: oldInput?.usageLimit || '',
        usagePerUser: oldInput?.usagePerUser || '',
        startDate: formatDateForInput(oldInput?.startDate),
        endDate: formatDateForInput(oldInput?.endDate),
        isActive: oldInput?.isActive === false
            ? false
            : String(oldInput?.isActive || 'true') !== 'false'
    };

    return {
        errors,
        fieldErrors: mapIssuesToFields(errors),
        oldInput: normalizedOldInput,
        formData: normalizedOldInput,
        couponId: coupon?._id || null,
        formError,
        validationRules: couponValidationRules,
        isEditMode,
        coupon,
        pageTitle: isEditMode ? 'Edit Coupon' : 'Create Coupon',
        formAction: isEditMode ? `/admin/coupons/${coupon?._id}/edit` : '/admin/coupons/create',
        submitLabel: isEditMode ? 'Update Coupon' : 'Create Coupon'
    };
};

const getOfferOldInput = (offer = {}) => ({
    name: offer?.name || '',
    type: offer?.type || 'PRODUCT',
    discountType: offer?.discountType || 'PERCENTAGE',
    discountValue: offer?.discountValue ?? '',
    maxDiscountAmount: offer?.maxDiscountAmount ?? offer?.maxDiscount ?? '',
    minOrderValue: offer?.minOrderValue ?? '',
    applicableProducts: normalizeSelectionArray((offer?.applicableProducts || []).map((id) => String(id))),
    applicableCategories: normalizeSelectionArray((offer?.applicableCategories || []).map((id) => String(id))),
    applicableBrands: normalizeSelectionArray((offer?.applicableBrands || []).map((id) => String(id))),
    startDate: formatDateForInput(offer?.startDate),
    endDate: formatDateForInput(offer?.endDate)
});

const validateOfferForm = async ({ body, offerId = null }) => {
    const parsed = createOfferSchema.safeParse(body);

    if (!parsed.success) {
        return {
            success: false,
            status: 400,
            errors: parsed.error.issues,
            oldInput: body
        };
    }

    const startDate = new Date(body.startDate);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(body.endDate);
    endDate.setHours(23, 59, 59, 999);
    const productIds = toObjectIds(body.applicableProducts);
    const categoryIds = toObjectIds(body.applicableCategories);
    const brandIds = toObjectIds(body.applicableBrands);
    const resolvedMaxDiscountAmount = parsed.data.maxDiscountAmount !== ''
        ? parsed.data.maxDiscountAmount
        : parsed.data.maxDiscount;
    const existing = await Offer.findOne({
        name: new RegExp(`^${escapeRegex(body.name)}$`, 'i'),
        isDeleted: false,
        ...(offerId ? { _id: { $ne: offerId } } : {})
    }).lean();

    if (
        (parsed.data.type === 'PRODUCT' && productIds.length === 0)
        || (parsed.data.type === 'CATEGORY' && categoryIds.length === 0)
        || (parsed.data.type === 'BRAND' && brandIds.length === 0)
    ) {
        const errorPath = parsed.data.type === 'PRODUCT'
            ? 'applicableProducts'
            : parsed.data.type === 'CATEGORY'
                ? 'applicableCategories'
                : 'applicableBrands';

        return {
            success: false,
            status: 400,
            errors: [{ path: [errorPath], message: 'Invalid or missing target selection' }],
            oldInput: body
        };
    }

    if (existing) {
        return {
            success: false,
            status: 400,
            errors: [{ path: ['name'], message: 'Offer name already exists' }],
            oldInput: body,
            formError: 'Offer name already exists'
        };
    }

    if (endDate <= startDate) {
        return {
            success: false,
            status: 400,
            oldInput: body,
            formError: 'Invalid date range'
        };
    }

    if (
        parsed.data.type === 'PRODUCT'
        && parsed.data.discountType === 'PERCENTAGE'
        && resolvedMaxDiscountAmount != null
        && resolvedMaxDiscountAmount !== ''
    ) {
        const selectedProducts = await Product.find({
            _id: { $in: productIds },
            isListed: true,
            isDeleted: false
        }).select('price').lean();
        const lowestSelectedPrice = selectedProducts.reduce((minPrice, product) => {
            const price = Number(product?.price || 0);
            return Math.min(minPrice, price);
        }, Number.POSITIVE_INFINITY);

        if (!selectedProducts.length || resolvedMaxDiscountAmount > lowestSelectedPrice) {
            return {
                success: false,
                status: 400,
                errors: [{
                    path: ['maxDiscountAmount'],
                    message: 'Max discount cannot exceed the selected product price'
                }],
                oldInput: body,
                formError: 'Max discount is invalid for the selected product'
            };
        }
    }

    return {
        success: true,
        payload: {
            ...parsed.data,
            name: body.name.toLowerCase(),
            minOrderValue: Number(parsed.data.minOrderValue || 0),
            maxDiscountAmount: parsed.data.discountType === 'PERCENTAGE' && resolvedMaxDiscountAmount !== '' && resolvedMaxDiscountAmount != null
                ? Number(resolvedMaxDiscountAmount)
                : null,
            maxDiscount: parsed.data.discountType === 'PERCENTAGE' && resolvedMaxDiscountAmount !== '' && resolvedMaxDiscountAmount != null
                ? Number(resolvedMaxDiscountAmount)
                : null,
            applicableProducts: productIds,
            applicableCategories: categoryIds,
            applicableBrands: brandIds,
            startDate,
            endDate
        }
    };
};

// @desc    Get Customers Page (with Pagination)
// @route   GET /admin/customers
const getCustomersPage = async (req, res) => {
    try {
        const { search, page = 1, status, sort } = req.query;
        const limit = 15;
        const currentPage = parseInt(page) || 1;

        let query = { role: 'user', isDeleted: { $ne: true } };

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } },
            ];
        }

        if (status === 'active') {
            query.isBlocked = false;
        }
        if (status === 'banned') {
            query.isBlocked = true;
        }

        let sortOption = { createdAt: -1 };
        if (sort === 'oldest') {
            sortOption = { createdAt: 1 };
        }
        if (sort === 'az') {
            sortOption = { name: 1 };
        }
        if (sort === 'za') {
            sortOption = { name: -1 };
        }

        const totalCustomers = await User.countDocuments(query);
        const totalPages = Math.ceil(totalCustomers / limit);

        // If current page exceeds total pages (e.g., last user on page was deleted), redirect to last valid page
        if (currentPage > totalPages && totalPages > 0) {
            const params = new URLSearchParams(req.query);
            params.set('page', totalPages);
            return res.redirect(`/admin/customers?${params.toString()}`);
        }

        const skip = (currentPage - 1) * limit;

        const users = await User.find(query)
            .sort(sortOption)
            .skip(skip)
            .limit(limit);

        const augmentedUsers = users.map(user => ({
            ...user.toObject(),
            totalOrders: 0,
            lifetimeValue: 0,
            lastActive: user.updatedAt
        }));

        res.render('admin/customers', {
            consumers: augmentedUsers,
            search: search || '',
            status: status || '',
            currentSort: sort || 'newest',
            pagination: {
                currentPage,
                totalPages,
                totalCustomers,
                hasNextPage: currentPage < totalPages,
                hasPrevPage: currentPage > 1
            }
        });
    } catch (error) {
        res.render('admin/customers', {
            consumers: [],
            search: '',
            status: '',
            currentSort: 'newest',
            error: 'Failed to load customers. Please try again.',
            pagination: { currentPage: 1, totalPages: 0, totalCustomers: 0, hasNextPage: false, hasPrevPage: false }
        });
    }
};

// @desc    Toggle Block User
// @route   POST /admin/customers/:id/toggle-block
const toggleBlockUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (user.role === 'admin') {
            return res.status(403).json({ success: false, message: 'Cannot block admin' });
        }

        user.isBlocked = !user.isBlocked;
        await user.save();

        res.json({ success: true, isBlocked: user.isBlocked });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update user status' });
    }
};

// @desc    Soft Delete User
// @route   POST /admin/customers/:id/delete
const softDeleteUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        user.isDeleted = true;
        await user.save();

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to delete user' });
    }
};

// @desc    Get Customer Details Page
// @route   GET /admin/customers/:id
const getCustomerDetails = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user || user.role === 'admin' || user.isDeleted) {
            return res.redirect('/admin/customers');
        }

        const wallet = await Wallet.findOne({ userId: user._id }).lean();
        const transactions = await WalletTransaction.find({ userId: user._id })
            .sort({ createdAt: -1 })
            .lean();
        await attachOrderIds(transactions);
        const orders = await Order.find({ user: user._id })
            .sort({ createdAt: -1 })
            .lean();
        const totalOrders = orders.length;
        const lifetimeValue = orders.reduce((sum, order) => {
            return sum + Number(order && order.totalAmount ? order.totalAmount : 0);
        }, 0);

        const customer = {
            ...user.toObject(),
            totalOrders,
            lifetimeValue,
            joinedDate: user.createdAt,
            lastLogin: user.updatedAt,
            walletBalance: wallet ? Number(wallet.balance || 0) : 0
        };

        res.render('admin/customer-details', {
            customer,
            orders,
            wallet,
            transactions,
            adminUserEditEnabled: ENABLE_ADMIN_USER_EDIT
        });
    } catch (error) {
        res.redirect('/admin/customers');
    }
};

// @desc    Render Edit Customer Page
// @route   GET /admin/customers/:id/edit
const renderEditCustomerPage = async (req, res) => {
    try {
        if (!ENABLE_ADMIN_USER_EDIT) {
            return res.redirect(`/admin/customers/${req.params.id}`);
        }

        const user = await User.findById(req.params.id);
        if (!user || user.role === 'admin' || user.isDeleted) {
            return res.redirect('/admin/customers');
        }
        res.render('admin/edit-customer', { customer: user, error: null, errors: {}, oldInput: null });
    } catch (error) {
        res.redirect('/admin/customers');
    }
};

// @desc    Update Customer Profile
// @route   POST /admin/customers/:id/update
const updateCustomer = async (req, res) => {
    try {
        if (!ENABLE_ADMIN_USER_EDIT) {
            return res.status(403).json({
                success: false,
                message: 'Editing user details is currently disabled'
            });
        }

        const { name, email, phone } = req.body;
        const user = await User.findById(req.params.id);
        const errors = {};

        if (!user || user.role === 'admin' || user.isDeleted) {
            return res.redirect('/admin/customers');
        }

        // Validation
        if (!name || name.trim().length < 2) {
            errors.name = 'Name is required (min 2 characters).';
        }
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            errors.email = 'Please enter a valid email address.';
        }
        if (phone && !/^\d{10}$/.test(phone.trim())) {
            errors.phone = 'Phone must be exactly 10 digits.';
        }

        if (Object.keys(errors).length > 0) {
            return res.render('admin/edit-customer', {
                customer: user,
                error: null,
                errors,
                oldInput: req.body
            });
        }

        // Check email uniqueness (if changed)
        if (email.toLowerCase() !== user.email.toLowerCase()) {
            const existing = await User.findOne({ email: email.toLowerCase(), _id: { $ne: user._id } });
            if (existing) {
                return res.render('admin/edit-customer', {
                    customer: user,
                    error: 'A user with this email already exists.',
                    errors: {},
                    oldInput: req.body
                });
            }
        }

        user.name = name || user.name;
        user.email = email || user.email;
        user.phone = phone || user.phone;

        await user.save();
        res.redirect(`/admin/customers/${user._id}`);
    } catch (error) {
        const user = await User.findById(req.params.id).catch(() => null);
        res.render('admin/edit-customer', {
            customer: user || { _id: req.params.id, name: '', email: '', phone: '' },
            error: 'Failed to update customer. Please try again.',
            errors: {},
            oldInput: req.body
        });
    }
};

// @desc    Update Admin Notes
// @route   POST /admin/customers/:id/notes
const updateAdminNotes = async (req, res) => {
    try {
        const { adminNotes } = req.body;
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        user.adminNotes = adminNotes;
        await user.save();

        res.json({ success: true, message: 'Notes updated' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update notes' });
    }
};

// @desc    Export Customers to CSV
// @route   GET /admin/customers/export
const exportCustomers = async (req, res) => {
    try {
        const { search } = req.query;
        let query = { role: 'user', isDeleted: { $ne: true } };

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } },
            ];
        }

        const users = await User.find(query).sort({ createdAt: -1 });

        const fields = ['_id', 'name', 'email', 'phone', 'isBlocked', 'createdAt'];
        const opts = { fields };

        try {
            const parser = new Parser(opts);
            const csv = parser.parse(users);

            res.header('Content-Type', 'text/csv');
            res.attachment('customers.csv');
            return res.send(csv);
        } catch (err) {
            return res.status(500).json({ success: false, message: 'Failed to generate CSV export' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to export customers' });
    }
};

// @desc    Get Customer Orders Page
// @route   GET /admin/customers/:id/orders
const getCustomerOrders = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user || user.role === 'admin' || user.isDeleted) {
            return res.redirect('/admin/customers');
        }

        const orders = await Order.find({ user: user._id, deleted: false }).sort({ createdAt: -1 });

        res.render('admin/customer-orders', { customer: user, orders });
    } catch (error) {
        res.redirect(`/admin/customers/${req.params.id}`);
    }
};

// @desc    Update Admin Profile
// @route   POST /admin/profile/update
const updateAdminProfile = async (req, res) => {
    try {
        const { name, email, phone } = req.body;

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            if (req.headers['content-type'] === 'application/x-www-form-urlencoded') {
                return res.redirect('back');
            }
            return res.status(400).json({ success: false, message: 'Invalid email address' });
        }

        // We rely on session.userId now as per standardized auth
        if (req.session.userId) {
            const dbUser = await User.findById(req.session.userId);
            if (!dbUser) {
                return res.status(404).json({ success: false, message: 'User not found' });
            }

            if (email && email !== dbUser.email) {
                await profileService.requestEmailChange(req.session.userId, email);
                req.session.otpEmail = email;

                if (req.headers['content-type'] === 'application/x-www-form-urlencoded') {
                    return res.redirect('/verify-otp?mode=email_change');
                }

                return res.json({
                    success: true,
                    requiresOtp: true,
                    message: 'OTP sent to new email. Please verify to complete email change.'
                });
            }

            dbUser.name = name || dbUser.name;
            dbUser.phone = phone !== undefined ? phone : dbUser.phone;

            await dbUser.save();

            // Note: Global middleware will pick up the changes on next request
            // No need to manually update session.user object since we don't store it

        } else {
            // Env-Based Admin (Legacy Support or Fallback)
            // If they are logged in via env variables (no DB ID), they might fail the userId check
            // user request said "Standardize on req.session.userId".
            // Implementation Plan assumed proper DB admins. 
            // If we are strictly following "Standardize on req.session.userId", 
            // then Env-admins must also have a userId or we handle them gracefully.
            // But since login controller sets userId=null for env-admins?
            // Wait, my login controller change forces userId = user._id.
            // This means Env-admins MUST have a DB record?
            // Yes, standardizing usually implies making them first-class citizens.

            return res.status(403).json({ success: false, message: 'Restricted to DB Admins' });
        }

        if (req.headers['content-type'] === 'application/x-www-form-urlencoded') {
            return res.redirect('back');
        }

        res.json({
            success: true,
            user: { name, email, phone }
        });

    } catch (error) {
        if (req.headers['content-type'] === 'application/x-www-form-urlencoded') {
            return res.redirect('back');
        }
        res.status(500).json({ success: false, message: 'Failed to update profile' });
    }
};

// @desc    Render Change Password Page
// @route   GET /admin/change-password
const getChangePasswordPage = (req, res) => {
    res.render('admin/change-password', { message: null, messageType: null });
};

// @desc    Handle Admin Password Change
// @route   POST /admin/change-password
const changeAdminPassword = async (req, res) => {
    try {
        const { currentPassword, newPassword, confirmPassword } = req.body;

        if (!newPassword || newPassword.length < 8) {
            return res.render('admin/change-password', {
                message: 'New password must be at least 8 characters',
                messageType: 'error'
            });
        }

        if (newPassword !== confirmPassword) {
            return res.render('admin/change-password', {
                message: 'Passwords do not match',
                messageType: 'error'
            });
        }

        // Case 1: DB-Based Admin
        if (req.user && req.user._id) {
            const user = await User.findById(req.user._id);
            if (!user) {
                return res.render('admin/change-password', {
                    message: 'Admin user not found',
                    messageType: 'error'
                });
            }

            const isMatch = await bcrypt.compare(currentPassword, user.password);
            if (!isMatch) {
                return res.render('admin/change-password', {
                    message: 'Current password is incorrect',
                    messageType: 'error'
                });
            }

            const salt = await bcrypt.genSalt(10);
            user.password = await bcrypt.hash(newPassword, salt);
            await user.save();

            return res.redirect('/admin/dashboard?passwordChanged=true');
        }
        // Case 2: Env-Based Admin
        else {
            const adminEmail = req.session.adminEmail || process.env.ADMIN_EMAIL;
            const adminName = req.session.adminName || process.env.ADMIN_NAME || 'Admin';

            let adminUser = await User.findOne({ email: adminEmail });

            if (adminUser) {
                const isMatch = await bcrypt.compare(currentPassword, adminUser.password);
                if (!isMatch) {
                    const envPassword = process.env.ADMIN_PASSWORD;
                    if (currentPassword !== envPassword) {
                        return res.render('admin/change-password', {
                            message: 'Current password is incorrect',
                            messageType: 'error'
                        });
                    }
                }

                const salt = await bcrypt.genSalt(10);
                adminUser.password = await bcrypt.hash(newPassword, salt);
                await adminUser.save();
            } else {
                const envPassword = process.env.ADMIN_PASSWORD;
                if (currentPassword !== envPassword) {
                    return res.render('admin/change-password', {
                        message: 'Current password is incorrect',
                        messageType: 'error'
                    });
                }

                const salt = await bcrypt.genSalt(10);
                const hashedPassword = await bcrypt.hash(newPassword, salt);

                adminUser = new User({
                    name: adminName,
                    email: adminEmail,
                    password: hashedPassword,
                    role: 'admin',
                    isVerified: true
                });
                await adminUser.save();
            }

            return res.redirect('/admin/dashboard?passwordChanged=true');
        }
    } catch (error) {
        return res.render('admin/change-password', {
            message: 'An error occurred while changing password',
            messageType: 'error'
        });
    }
};

// @desc    Render Add Customer Page
// @route   GET /admin/customers/add
const renderAddCustomerPage = (req, res) => {
    res.render('admin/add-customer', { message: null, messageType: null, errors: {}, oldInput: {} });
};

// @desc    Add New Customer
// @route   POST /admin/customers/add
const addCustomer = async (req, res) => {
    try {
        const { name, email, phone, password } = req.body;
        const errors = {};

        // Validation
        if (!name || name.trim().length < 2) {
            errors.name = 'Name is required (min 2 characters).';
        }
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            errors.email = 'Please enter a valid email address.';
        }
        if (!password || password.length < 8) {
            errors.password = 'Password must be at least 8 characters.';
        }
        if (phone && !/^\d{10}$/.test(phone.trim())) {
            errors.phone = 'Phone must be exactly 10 digits.';
        }

        if (Object.keys(errors).length > 0) {
            return res.render('admin/add-customer', {
                message: null,
                messageType: null,
                errors,
                oldInput: req.body
            });
        }

        // Check if email already exists
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.render('admin/add-customer', {
                message: 'A user with this email already exists.',
                messageType: 'error',
                errors: {},
                oldInput: req.body
            });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new User({
            name,
            email: email.toLowerCase(),
            phone: phone || '',
            password: hashedPassword,
            role: 'user',
            isVerified: true,
            isDeleted: false,
            isBlocked: false
        });

        await newUser.save();

        res.redirect('/admin/customers');
    } catch (error) {
        return res.render('admin/add-customer', {
            message: 'An error occurred while adding customer. Please try again.',
            messageType: 'error',
            errors: {},
            oldInput: req.body
        });
    }
};

// @desc    Get Offers Page
// @route   GET /admin/offers
const getOffersPage = async (req, res) => {
    try {
        const { type = '', status = '', sort = 'newest' } = req.query;
        const query = { isDeleted: false };

        if (['PRODUCT', 'CATEGORY', 'BRAND'].includes(type)) {
            query.type = type;
        }

        if (status === 'active') {
            query.isActive = true;
        }

        if (status === 'inactive') {
            query.isActive = false;
        }

        let sortOption = { createdAt: -1 };

        if (sort === 'oldest') {
            sortOption = { createdAt: 1 };
        }

        if (sort === 'discount_high') {
            sortOption = { discountValue: -1, createdAt: -1 };
        }

        const offers = await Offer.find(query)
            .sort(sortOption)
            .lean();

        return res.render('admin/offers', {
            offers,
            filters: {
                type,
                status,
                sort
            }
        });
    } catch (error) {
        return res.render('admin/offers', {
            offers: [],
            filters: {
                type: '',
                status: '',
                sort: 'newest'
            },
            error: 'Failed to load offers'
        });
    }
};

// @desc    Get Coupons Page
// @route   GET /admin/coupons
const getCouponsPage = async (req, res) => {
    try {
        const {
            page = 1,
            search: rawSearch = '',
            status = '',
            discountType = ''
        } = req.query;
        const search = String(rawSearch || '').trim();

        const query = {
            isDeleted: false
        };

        if (search) {
            query.code = { $regex: escapeRegex(search), $options: 'i' };
        }

        if (status === 'active') {
            query.isActive = true;
        } else if (status === 'inactive') {
            query.isActive = false;
        }

        if (discountType === 'FLAT' || discountType === 'PERCENTAGE') {
            query.discountType = discountType;
        }

        const currentPage = Math.max(Number(page) || 1, 1);
        const limit = 10;
        const skip = (currentPage - 1) * limit;

        const [coupons, total] = await Promise.all([
            Coupon.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Coupon.countDocuments(query)
        ]);

        return res.render('admin/coupons', {
            coupons,
            currentPage,
            totalPages: Math.max(Math.ceil(total / limit), 1),
            searchQuery: search,
            filters: {
                search,
                status,
                discountType
            },
            formError: null
        });
    } catch (error) {
        return res.status(500).render('admin/coupons', {
            coupons: [],
            currentPage: 1,
            totalPages: 1,
            searchQuery: '',
            filters: {
                search: '',
                status: '',
                discountType: ''
            },
            formError: 'Failed to load coupons'
        });
    }
};

// @desc    Get Create Coupon Page
// @route   GET /admin/coupons/create
const getCreateCouponPage = async (req, res) => {
    return res.render('admin/create-coupon', buildCouponFormView());
};

// @desc    Check Coupon Code Availability
// @route   GET /admin/coupons/check-code
const checkCouponCode = async (req, res) => {
    try {
        const code = String(req.query.code || '').trim().toUpperCase();
        const excludeId = req.query.excludeId;

        if (!code) {
            return res.json({ exists: false });
        }

        const query = {
            code,
            isDeleted: false
        };

        if (excludeId && mongoose.Types.ObjectId.isValid(excludeId)) {
            query._id = { $ne: excludeId };
        }

        const existing = await Coupon.exists(query);

        return res.json({ exists: Boolean(existing) });
    } catch (error) {
        return res.status(500).json({ exists: false, error: true });
    }
};

// @desc    Get Edit Coupon Page
// @route   GET /admin/coupons/:id/edit
const getEditCouponPage = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.redirect('/admin/coupons');
        }

        const [coupon, totalUsage, uniqueUsers] = await Promise.all([
            Coupon.findOne({
                _id: id,
                isDeleted: false
            }).lean(),
            CouponUsage.countDocuments({ couponId: id }),
            CouponUsage.distinct('userId', { couponId: id })
        ]);

        if (!coupon) {
            return res.redirect('/admin/coupons');
        }

        return res.render('admin/create-coupon', buildCouponFormView({
            oldInput: coupon,
            coupon,
            isEditMode: true
        }));
    } catch (error) {
        return res.redirect('/admin/coupons');
    }
};

// @desc    Create Coupon
// @route   POST /admin/coupons/create
const createCoupon = async (req, res) => {
    try {
        const normalizedBody = {
            ...req.body,
            discountValue: Number(req.body.discountValue || 0),
            minOrderValue: Number(req.body.minOrderValue || 0),
            usageLimit: req.body.usageLimit ? Number(req.body.usageLimit) : undefined,
            usagePerUser: req.body.usagePerUser ? Number(req.body.usagePerUser) : undefined,
            maxDiscount:
                req.body.maxDiscount && Number(req.body.maxDiscount) > 0
                    ? Number(req.body.maxDiscount)
                    : undefined,
            startDate: normalizeAdminDateInput(req.body.startDate),
            endDate: normalizeAdminDateInput(req.body.endDate),
            code: String(req.body.code || '').trim().toUpperCase(),
            isActive: req.body.isActive === 'false' ? false : Boolean(req.body.isActive)
        };
        const body = normalizedBody;

        const parsed = createCouponSchema.safeParse(body);

        if (!parsed.success) {
            return res.status(400).render('admin/create-coupon', buildCouponFormView({
                errors: parsed.error.issues,
                oldInput: body,
                formError: null
            }));
        }

        const existing = await Coupon.findOne({
            code: body.code,
            isDeleted: false
        });

        if (existing) {
            return res.status(400).render('admin/create-coupon', buildCouponFormView({
                errors: [{ path: ['code'], message: 'Coupon already exists' }],
                oldInput: body,
                formError: 'Duplicate coupon code'
            }));
        }

        const data = normalizeCouponDatesForSave({
            ...parsed.data,
            rawStartDate: body.startDate,
            rawEndDate: body.endDate
        });
        const coupon = new Coupon(data);
        console.log('FINAL DATA BEFORE SAVE:', data);
        await coupon.save();

        return res.redirect('/admin/coupons');
    } catch (error) {
        console.error('========================');
        console.error('COUPON CREATE FAILURE');
        console.error('ERROR NAME:', error.name);
        console.error('ERROR MESSAGE:', error.message);
        console.error('ERROR STACK:', error.stack);
        console.error('ERROR ERRORS:', error.errors);
        console.error('FULL ERROR OBJECT:', error);
        console.error('========================');

        return res.render('admin/create-coupon', {
            formError: error.message || 'Failed to create coupon',
            formData: req.body,
            errors: []
        });
    }
};

// @desc    Update Coupon
// @route   POST /admin/coupons/:id/edit
const updateCoupon = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.redirect('/admin/coupons');
        }

        const body = {
            ...req.body,
            discountValue: Number(req.body.discountValue || 0),
            minOrderValue: Number(req.body.minOrderValue || 0),
            usageLimit: req.body.usageLimit ? Number(req.body.usageLimit) : undefined,
            usagePerUser: req.body.usagePerUser ? Number(req.body.usagePerUser) : undefined,
            maxDiscount:
                req.body.maxDiscount && Number(req.body.maxDiscount) > 0
                    ? Number(req.body.maxDiscount)
                    : undefined,
            startDate: normalizeAdminDateInput(req.body.startDate),
            endDate: normalizeAdminDateInput(req.body.endDate),
            code: String(req.body.code || '').trim().toUpperCase(),
            isActive: req.body.isActive === 'false' ? false : req.body.isActive === 'true' || req.body.isActive === 'on'
        };

        const parsed = createCouponSchema.safeParse(body);

        if (!parsed.success) {
            return res.status(400).render('admin/create-coupon', buildCouponFormView({
                errors: parsed.error.issues,
                oldInput: body,
                coupon: { _id: id },
                isEditMode: true
            }));
        }

        const existing = await Coupon.findOne({
            code: parsed.data.code,
            isDeleted: false,
            _id: { $ne: id }
        });

        if (existing) {
            return res.status(400).render('admin/create-coupon', buildCouponFormView({
                errors: [{ path: ['code'], message: 'Coupon already exists' }],
                oldInput: body,
                formError: 'Duplicate coupon code',
                coupon: { _id: id },
                isEditMode: true
            }));
        }

        const data = normalizeCouponDatesForSave({
            ...parsed.data,
            rawStartDate: body.startDate,
            rawEndDate: body.endDate
        });

        await Coupon.updateOne(
            { _id: id, isDeleted: false },
            { $set: data }
        );

        return res.redirect(`/admin/coupons/${id}`);
    } catch (error) {
        return res.redirect('/admin/coupons');
    }
};

// @desc    Get Coupon Details Page
// @route   GET /admin/coupons/:id
const getCouponDetailsPage = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.redirect('/admin/coupons');
        }

        const [coupon, totalUsage, uniqueUsers] = await Promise.all([
            Coupon.findOne({
                _id: id,
                isDeleted: false
            }).lean(),
            CouponUsage.countDocuments({ couponId: id }),
            CouponUsage.distinct('userId', { couponId: id })
        ]);

        if (!coupon) {
            return res.redirect('/admin/coupons');
        }

        return res.render('admin/coupon-details', {
            coupon,
            usageStats: {
                totalUsage,
                uniqueUsers: uniqueUsers.length
            },
            now: new Date()
        });
    } catch (error) {
        return res.redirect('/admin/coupons');
    }
};

const toggleCouponStatus = async (req, res) => {
    try {
        const { id } = req.params;

        const coupon = await Coupon.findOne({
            _id: id,
            isDeleted: false
        });

        if (!coupon) {
            return res.redirect('/admin/coupons');
        }

        coupon.isActive = !coupon.isActive;
        await coupon.save();

        return res.redirect('/admin/coupons');
    } catch (error) {
        return res.redirect('/admin/coupons');
    }
};

const deleteCoupon = async (req, res) => {
    try {
        const { id } = req.params;

        await Coupon.updateOne(
            { _id: id, isDeleted: false },
            { $set: { isDeleted: true } }
        );

        return res.redirect('/admin/coupons');
    } catch (error) {
        return res.redirect('/admin/coupons');
    }
};

// @desc    Get Offer Details Page
// @route   GET /admin/offers/:id
const getOfferDetailsPage = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).render('admin/offer-details', {
                offer: null,
                error: 'Offer not found'
            });
        }

        const offer = await Offer.findOne({
            _id: req.params.id,
            isDeleted: false
        })
            .populate('applicableBrands', 'name')
            .populate('applicableProducts', 'title')
            .populate('applicableCategories', 'name')
            .lean();

        if (!offer) {
            return res.status(404).render('admin/offer-details', {
                offer: null,
                error: 'Offer not found'
            });
        }

        return res.render('admin/offer-details', {
            offer,
            error: null
        });
    } catch (error) {
        return res.status(500).render('admin/offer-details', {
            offer: null,
            error: 'Failed to load offer details'
        });
    }
};

// @desc    Get Create Offer Page
// @route   GET /admin/offers/create
const getCreateOfferPage = async (req, res) => {
    try {
        const viewModel = await buildOfferFormView();

        return res.render('admin/create-offer', viewModel);
    } catch (error) {
        return res.status(500).render('admin/create-offer', {
            products: [],
            categories: [],
            brands: [],
            errors: [],
            fieldErrors: {},
            oldInput: {
                name: '',
                type: 'PRODUCT',
                discountType: 'PERCENTAGE',
                discountValue: '',
                maxDiscountAmount: '',
                minOrderValue: '',
                applicableProducts: [],
                applicableCategories: [],
                applicableBrands: [],
                startDate: '',
                endDate: ''
            },
            formError: 'Failed to load offer form',
            formMode: 'create',
            offer: null,
            formAction: '/admin/offers/create',
            pageTitle: 'Create Offer',
            pageDescription: 'Set up a targeted offer and keep it ready for the pricing engine.',
            submitLabel: 'Create Offer'
        });
    }
};

// @desc    Get Edit Offer Page
// @route   GET /admin/offers/:id/edit
const getEditOfferPage = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).render('admin/offer-details', {
                offer: null,
                error: 'Offer not found'
            });
        }

        const offer = await Offer.findOne({
            _id: req.params.id,
            isDeleted: false
        }).lean();

        if (!offer) {
            return res.status(404).render('admin/offer-details', {
                offer: null,
                error: 'Offer not found'
            });
        }

        const viewModel = await buildOfferFormView({
            oldInput: getOfferOldInput(offer),
            offer,
            formMode: 'edit'
        });

        return res.render('admin/create-offer', viewModel);
    } catch (error) {
        return res.status(500).render('admin/offer-details', {
            offer: null,
            error: 'Failed to load offer for editing'
        });
    }
};

// @desc    Create Offer
// @route   POST /admin/offers/create
const createOffer = async (req, res) => {
    try {
        const body = {
            ...req.body,
            applicableProducts: normalizeToArray(req.body.applicableProducts),
            applicableCategories: normalizeToArray(req.body.applicableCategories),
            applicableBrands: normalizeToArray(req.body.applicableBrands)
        };
        body.name = String(body.name || '').trim();
        const validation = await validateOfferForm({ body });

        if (!validation.success) {
            const viewModel = await buildOfferFormView({
                errors: validation.errors,
                oldInput: validation.oldInput,
                formError: validation.formError
            });

            return res.status(validation.status).render('admin/create-offer', viewModel);
        }

        const data = await enforceOfferSafetyRules(normalizeOfferDataForSave({ ...validation.payload }));
        const offer = new Offer(data);

        await offer.save();
        clearOfferCache();

        if (process.env.NODE_ENV !== 'production') {
            console.log('Offer created:', offer._id);
        }

        return res.redirect('/admin/offers');
    } catch (err) {
        console.error('OFFER ERROR:', err);

        if (err?.code === 11000) {
            const viewModel = await buildOfferFormView({
                errors: [{ path: ['name'], message: 'Offer name already exists' }],
                oldInput: {
                    ...req.body,
                    applicableProducts: normalizeToArray(req.body.applicableProducts),
                    applicableCategories: normalizeToArray(req.body.applicableCategories),
                    applicableBrands: normalizeToArray(req.body.applicableBrands)
                },
                formError: 'Offer name already exists'
            });

            return res.status(400).render('admin/create-offer', viewModel);
        }

        if (err instanceof AppError) {
            const errorField = err.message === 'Discount exceeds cheapest product price in selection'
                ? 'discountValue'
                : err.message === 'Discount must be less than minimum order value'
                    ? 'discountValue'
                    : 'maxDiscountAmount';
            const viewModel = await buildOfferFormView({
                errors: [{ path: [errorField], message: err.message }],
                oldInput: {
                    ...req.body,
                    applicableProducts: normalizeToArray(req.body.applicableProducts),
                    applicableCategories: normalizeToArray(req.body.applicableCategories),
                    applicableBrands: normalizeToArray(req.body.applicableBrands)
                },
                formError: err.message
            });

            return res.status(err.statusCode || 400).render('admin/create-offer', viewModel);
        }

        const viewModel = await buildOfferFormView({
            oldInput: {
                ...req.body,
                applicableProducts: normalizeToArray(req.body.applicableProducts),
                applicableCategories: normalizeToArray(req.body.applicableCategories),
                applicableBrands: normalizeToArray(req.body.applicableBrands)
            },
            formError: 'Failed to create offer. Please try again.'
        });

        return res.status(500).render('admin/create-offer', viewModel);
    }
};

// @desc    Update Offer
// @route   PATCH /admin/offers/:id
const updateOffer = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).render('admin/offer-details', {
                offer: null,
                error: 'Offer not found'
            });
        }

        const offer = await Offer.findOne({
            _id: req.params.id,
            isDeleted: false
        });

        if (!offer) {
            return res.status(404).render('admin/offer-details', {
                offer: null,
                error: 'Offer not found'
            });
        }

        const body = {
            ...req.body,
            applicableProducts: normalizeToArray(req.body.applicableProducts),
            applicableCategories: normalizeToArray(req.body.applicableCategories),
            applicableBrands: normalizeToArray(req.body.applicableBrands)
        };
        body.name = String(body.name || '').trim();

        const validation = await validateOfferForm({
            body,
            offerId: offer._id
        });

        if (!validation.success) {
            const viewModel = await buildOfferFormView({
                errors: validation.errors,
                oldInput: validation.oldInput,
                formError: validation.formError,
                offer: {
                    ...offer.toObject(),
                    _id: offer._id
                },
                formMode: 'edit'
            });

            return res.status(validation.status).render('admin/create-offer', viewModel);
        }

        const data = await enforceOfferSafetyRules(normalizeOfferDataForSave({ ...validation.payload }));

        Object.assign(offer, data);
        await offer.save();
        clearOfferCache();

        return res.redirect(`/admin/offers/${offer._id}`);
    } catch (err) {
        console.error('OFFER ERROR:', err);

        if (err instanceof AppError) {
            const errorField = err.message === 'Discount exceeds cheapest product price in selection'
                ? 'discountValue'
                : err.message === 'Discount must be less than minimum order value'
                    ? 'discountValue'
                    : 'maxDiscountAmount';
            const existingOffer = mongoose.Types.ObjectId.isValid(req.params.id)
                ? await Offer.findOne({ _id: req.params.id, isDeleted: false }).lean()
                : null;
            const viewModel = await buildOfferFormView({
                errors: [{ path: [errorField], message: err.message }],
                oldInput: {
                    ...req.body,
                    applicableProducts: normalizeToArray(req.body.applicableProducts),
                    applicableCategories: normalizeToArray(req.body.applicableCategories),
                    applicableBrands: normalizeToArray(req.body.applicableBrands)
                },
                formError: err.message,
                offer: existingOffer,
                formMode: 'edit'
            });

            return res.status(err.statusCode || 400).render('admin/create-offer', viewModel);
        }

        const existingOffer = mongoose.Types.ObjectId.isValid(req.params.id)
            ? await Offer.findOne({ _id: req.params.id, isDeleted: false }).lean()
            : null;
        const viewModel = await buildOfferFormView({
            oldInput: {
                ...req.body,
                applicableProducts: normalizeToArray(req.body.applicableProducts),
                applicableCategories: normalizeToArray(req.body.applicableCategories),
                applicableBrands: normalizeToArray(req.body.applicableBrands)
            },
            formError: 'Failed to update offer. Please try again.',
            offer: existingOffer,
            formMode: 'edit'
        });

        return res.status(500).render('admin/create-offer', viewModel);
    }
};

// @desc    Toggle Offer
// @route   PATCH /admin/offers/:id/toggle
const toggleOffer = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: 'Invalid ID' });
        }

        const offer = await Offer.findById(req.params.id);

        if (!offer || offer.isDeleted) {
            return res.status(404).json({ success: false, message: 'Offer not found' });
        }

        offer.isActive = !offer.isActive;
        await offer.save();
        clearOfferCache();

        return res.json({ success: true, isActive: offer.isActive });
    } catch (err) {
        console.error('OFFER ERROR:', err);
        return res.status(500).json({ success: false, message: 'Failed to toggle offer' });
    }
};

// @desc    Soft Delete Offer
// @route   DELETE /admin/offers/:id
const deleteOffer = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: 'Invalid ID' });
        }

        const offer = await Offer.findById(req.params.id);

        if (!offer) {
            return res.status(404).json({ success: false, message: 'Offer not found' });
        }

        await Offer.updateOne(
            { _id: req.params.id },
            { $set: { isDeleted: true } }
        );

        clearOfferCache();

        return res.json({ success: true });
    } catch (err) {
        console.error('OFFER ERROR:', err);
        return res.status(500).json({ success: false, message: 'Failed to delete offer' });
    }
};

// @desc    Get Admin Dashboard KPI Stats
// @route   GET /admin/dashboard-stats
const getDashboardStats = async (req, res) => {
    try {
        const normalizedStatusExpr = {
            $toLower: {
                $ifNull: ['$orderStatus', '$status']
            }
        };

        const [productStats, orderStats] = await Promise.all([
            Product.aggregate([
                {
                    $group: {
                        _id: null,
                        totalProducts: { $sum: 1 },
                        activeProducts: {
                            $sum: {
                                $cond: [{ $ne: ['$isDeleted', true] }, 1, 0]
                            }
                        }
                    }
                }
            ]),
            Order.aggregate([
                {
                    $facet: {
                        totalOrders: [
                            { $count: 'count' }
                        ],
                        totalRevenue: [
                            {
                                $match: {
                                    $expr: { $eq: [normalizedStatusExpr, 'delivered'] }
                                }
                            },
                            {
                                $group: {
                                    _id: null,
                                    totalRevenue: { $sum: { $ifNull: ['$totalAmount', 0] } }
                                }
                            }
                        ],
                        returns: [
                            {
                                $match: {
                                    $expr: { $eq: [normalizedStatusExpr, 'returned'] }
                                }
                            },
                            { $count: 'count' }
                        ],
                        cancellations: [
                            {
                                $match: {
                                    $expr: { $eq: [normalizedStatusExpr, 'cancelled'] }
                                }
                            },
                            { $count: 'count' }
                        ],
                        uniqueProductsSold: [
                            {
                                $match: {
                                    $expr: { $eq: [normalizedStatusExpr, 'delivered'] }
                                }
                            },
                            {
                                $project: {
                                    items: {
                                        $cond: [{ $isArray: '$items' }, '$items', []]
                                    }
                                }
                            },
                            { $unwind: '$items' },
                            {
                                $match: {
                                    'items.productId': { $exists: true, $ne: null }
                                }
                            },
                            {
                                $group: {
                                    _id: null,
                                    uniqueProducts: { $addToSet: '$items.productId' }
                                }
                            },
                            {
                                $project: {
                                    _id: 0,
                                    count: { $size: '$uniqueProducts' }
                                }
                            }
                        ]
                    }
                }
            ])
        ]);

        const aggregatedOrderStats = orderStats[0] || {};

        return res.json({
            totalProducts: Number(productStats[0]?.totalProducts || 0),
            activeProducts: Number(productStats[0]?.activeProducts || 0),
            uniqueProductsSold: Number(aggregatedOrderStats.uniqueProductsSold?.[0]?.count || 0),
            totalOrders: Number(aggregatedOrderStats.totalOrders?.[0]?.count || 0),
            totalRevenue: Number(aggregatedOrderStats.totalRevenue?.[0]?.totalRevenue || 0),
            returns: Number(aggregatedOrderStats.returns?.[0]?.count || 0),
            cancellations: Number(aggregatedOrderStats.cancellations?.[0]?.count || 0)
        });
    } catch (error) {
        console.error('DASHBOARD STATS ERROR:', error);
        return res.status(500).json({
            totalProducts: 0,
            activeProducts: 0,
            uniqueProductsSold: 0,
            totalOrders: 0,
            totalRevenue: 0,
            returns: 0,
            cancellations: 0
        });
    }
};

// @desc    Get Order Status Distribution Stats
// @route   GET /admin/order-status-stats
const getOrderStatusStats = async (req, res) => {
    try {
        const range = String(req.query.range || '').toLowerCase();
        const now = new Date();
        let startDate;

        switch (range) {
            case 'daily':
                startDate = new Date(now);
                startDate.setHours(0, 0, 0, 0);
                break;
            case 'weekly':
                startDate = new Date();
                startDate.setDate(startDate.getDate() - 7);
                break;
            case 'monthly':
                startDate = new Date();
                startDate.setMonth(startDate.getMonth() - 1);
                break;
            case 'yearly':
                startDate = new Date();
                startDate.setFullYear(startDate.getFullYear() - 1);
                break;
            default:
                startDate = new Date(0);
        }

        const stats = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: startDate }
                }
            },
            {
                $unwind: {
                    path: '$items',
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $project: {
                    normalizedStatus: {
                        $switch: {
                            branches: [
                                {
                                    case: {
                                        $eq: [
                                            { $ifNull: ['$items.status', '$orderStatus'] },
                                            'pending'
                                        ]
                                    },
                                    then: 'Pending'
                                },
                                {
                                    case: {
                                        $eq: [
                                            { $ifNull: ['$items.status', '$orderStatus'] },
                                            'shipped'
                                        ]
                                    },
                                    then: 'Shipped'
                                },
                                {
                                    case: {
                                        $eq: [
                                            { $ifNull: ['$items.status', '$orderStatus'] },
                                            'delivered'
                                        ]
                                    },
                                    then: 'Delivered'
                                },
                                {
                                    case: {
                                        $eq: [
                                            { $ifNull: ['$items.status', '$orderStatus'] },
                                            'cancelled'
                                        ]
                                    },
                                    then: 'Cancelled'
                                },
                                {
                                    case: {
                                        $eq: [
                                            { $ifNull: ['$items.status', '$orderStatus'] },
                                            'returned'
                                        ]
                                    },
                                    then: 'Returned'
                                },
                                {
                                    case: {
                                        $eq: [
                                            { $ifNull: ['$items.status', '$orderStatus'] },
                                            'return_requested'
                                        ]
                                    },
                                    then: 'Return Requested'
                                }
                            ],
                            default: null
                        }
                    },
                    quantity: {
                        $cond: [
                            {
                                $and: [
                                    { $ne: ['$items.quantity', null] },
                                    { $gt: ['$items.quantity', 0] }
                                ]
                            },
                            '$items.quantity',
                            1
                        ]
                    }
                }
            },
            {
                $group: {
                    _id: '$normalizedStatus',
                    count: { $sum: '$quantity' }
                }
            },
            {
                $match: {
                    _id: { $ne: null }
                }
            }
        ]);

        const statusMap = {
            Pending: 0,
            Shipped: 0,
            Delivered: 0,
            Cancelled: 0,
            Returned: 0,
            'Return Requested': 0
        };

        stats.forEach((item) => {
            if (Object.prototype.hasOwnProperty.call(statusMap, item._id)) {
                statusMap[item._id] = Number(item.count || 0);
            }
        });

        return res.json(statusMap);
    } catch (error) {
        console.error('ORDER STATUS CHART ERROR:', error);
        return res.status(500).json({
            Pending: 0,
            Shipped: 0,
            Delivered: 0,
            Cancelled: 0,
            Returned: 0,
            'Return Requested': 0
        });
    }
};

// @desc    Get Revenue Trend For Last 7 Days
// @route   GET /admin/revenue-trend
const getRevenueTrend = async (req, res) => {
    try {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 6);
        startDate.setHours(0, 0, 0, 0);

        const deliveredStatusExpr = {
            $toLower: {
                $ifNull: ['$orderStatus', '$status']
            }
        };

        const revenueData = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: startDate },
                    $expr: { $eq: [deliveredStatusExpr, 'delivered'] }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' },
                        day: { $dayOfMonth: '$createdAt' }
                    },
                    totalRevenue: { $sum: { $ifNull: ['$totalAmount', 0] } }
                }
            },
            {
                $sort: {
                    '_id.year': 1,
                    '_id.month': 1,
                    '_id.day': 1
                }
            }
        ]);

        const last7Days = [];
        for (let i = 6; i >= 0; i -= 1) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            date.setHours(0, 0, 0, 0);

            last7Days.push({
                date: date.toISOString().split('T')[0],
                revenue: 0
            });
        }

        revenueData.forEach((item) => {
            const date = `${item._id.year}-${String(item._id.month).padStart(2, '0')}-${String(item._id.day).padStart(2, '0')}`;
            const foundDay = last7Days.find((day) => day.date === date);

            if (foundDay) {
                foundDay.revenue = Number(item.totalRevenue || 0);
            }
        });

        return res.json(last7Days);
    } catch (error) {
        console.error('REVENUE TREND ERROR:', error);

        const fallbackDays = [];
        for (let i = 6; i >= 0; i -= 1) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            date.setHours(0, 0, 0, 0);

            fallbackDays.push({
                date: date.toISOString().split('T')[0],
                revenue: 0
            });
        }

        return res.status(500).json(fallbackDays);
    }
};

// @desc    Get Top Performing Products, Brands, and Categories
// @route   GET /admin/top-performers
const getTopPerformers = async (req, res) => {
    try {
        const deliveredMatchStage = {
            $match: {
                $expr: {
                    $eq: [
                        {
                            $toLower: {
                                $ifNull: ['$orderStatus', '$status']
                            }
                        },
                        'delivered'
                    ]
                }
            }
        };

        const unwindItemsStage = {
            $unwind: '$items'
        };

        const validProductItemMatchStage = {
            $match: {
                'items.productId': { $exists: true, $ne: null }
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

        const [products, brands, categories] = await Promise.all([
            Order.aggregate([
                deliveredMatchStage,
                unwindItemsStage,
                validProductItemMatchStage,
                {
                    $group: {
                        _id: '$items.productId',
                        totalRevenue: {
                            $sum: itemRevenueExpression
                        },
                        orders: { $addToSet: '$_id' }
                    }
                },
                {
                    $lookup: {
                        from: 'products',
                        localField: '_id',
                        foreignField: '_id',
                        as: 'product'
                    }
                },
                {
                    $unwind: '$product'
                },
                {
                    $match: {
                        'product.title': { $exists: true, $nin: [null, ''] }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        productId: '$_id',
                        name: '$product.title',
                        totalRevenue: { $round: ['$totalRevenue', 2] },
                        orderCount: { $size: '$orders' }
                    }
                },
                { $sort: { totalRevenue: -1, orderCount: -1, name: 1 } },
                { $limit: 10 }
            ]),
            Order.aggregate([
                deliveredMatchStage,
                unwindItemsStage,
                validProductItemMatchStage,
                {
                    $lookup: {
                        from: 'products',
                        localField: 'items.productId',
                        foreignField: '_id',
                        as: 'product'
                    }
                },
                {
                    $unwind: '$product'
                },
                {
                    $match: {
                        'product.brand': { $exists: true, $ne: null }
                    }
                },
                {
                    $lookup: {
                        from: 'brands',
                        localField: 'product.brand',
                        foreignField: '_id',
                        as: 'brand'
                    }
                },
                {
                    $unwind: '$brand'
                },
                {
                    $match: {
                        'brand.name': { $exists: true, $nin: [null, ''] }
                    }
                },
                {
                    $group: {
                        _id: '$brand._id',
                        brand: { $first: '$brand.name' },
                        totalRevenue: {
                            $sum: itemRevenueExpression
                        },
                        orders: { $addToSet: '$_id' }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        brand: 1,
                        totalRevenue: { $round: ['$totalRevenue', 2] },
                        orderCount: { $size: '$orders' }
                    }
                },
                { $sort: { totalRevenue: -1, orderCount: -1, brand: 1 } },
                { $limit: 10 }
            ]),
            Order.aggregate([
                deliveredMatchStage,
                unwindItemsStage,
                validProductItemMatchStage,
                {
                    $lookup: {
                        from: 'products',
                        localField: 'items.productId',
                        foreignField: '_id',
                        as: 'product'
                    }
                },
                {
                    $unwind: '$product'
                },
                {
                    $match: {
                        'product.category': { $exists: true, $ne: null }
                    }
                },
                {
                    $lookup: {
                        from: 'categories',
                        localField: 'product.category',
                        foreignField: '_id',
                        as: 'category'
                    }
                },
                {
                    $unwind: '$category'
                },
                {
                    $match: {
                        'category.name': { $exists: true, $nin: [null, ''] }
                    }
                },
                {
                    $group: {
                        _id: '$category._id',
                        category: { $first: '$category.name' },
                        totalRevenue: {
                            $sum: itemRevenueExpression
                        },
                        orders: { $addToSet: '$_id' }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        category: 1,
                        totalRevenue: { $round: ['$totalRevenue', 2] },
                        orderCount: { $size: '$orders' }
                    }
                },
                { $sort: { totalRevenue: -1, orderCount: -1, category: 1 } },
                { $limit: 10 }
            ])
        ]);

        return res.json({
            products,
            brands,
            categories
        });
    } catch (error) {
        console.error('TOP PERFORMERS ERROR:', error);
        return res.status(500).json({
            products: [],
            brands: [],
            categories: []
        });
    }
};

module.exports = {
    getDashboardStats,
    getOrderStatusStats,
    getRevenueTrend,
    getTopPerformers,
    getCustomersPage,
    toggleBlockUser,
    softDeleteUser,
    exportCustomers,
    getCustomerDetails,
    renderEditCustomerPage,
    updateCustomer,
    updateAdminNotes,
    getCustomerOrders,
    updateAdminProfile,
    getChangePasswordPage,
    changeAdminPassword,
    renderAddCustomerPage,
    addCustomer,
    getOffersPage,
    getCouponsPage,
    getCreateCouponPage,
    checkCouponCode,
    createCoupon,
    getEditCouponPage,
    updateCoupon,
    getCouponDetailsPage,
    toggleCouponStatus,
    deleteCoupon,
    getOfferDetailsPage,
    getCreateOfferPage,
    getEditOfferPage,
    createOffer,
    updateOffer,
    toggleOffer,
    deleteOffer
};
