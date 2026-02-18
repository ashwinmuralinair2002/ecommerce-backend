// Admin management controller for customer and system operations
const User = require('../models/user.model');
const Order = require('../models/order.model');
const { Parser } = require('json2csv');
const bcrypt = require('bcryptjs');

// @desc    Get Customers Page (with Pagination)
// @route   GET /admin/customers
const getCustomersPage = async (req, res) => {
    try {
        const { search, page = 1 } = req.query;
        const limit = 5;
        const currentPage = parseInt(page) || 1;

        let query = { role: 'user', isDeleted: { $ne: true } };

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } },
            ];
        }

        const totalCustomers = await User.countDocuments(query);
        const totalPages = Math.ceil(totalCustomers / limit);

        // If current page exceeds total pages (e.g., last user on page was deleted), redirect to last valid page
        if (currentPage > totalPages && totalPages > 0) {
            const searchParam = search ? `&search=${encodeURIComponent(search)}` : '';
            return res.redirect(`/admin/customers?page=${totalPages}${searchParam}`);
        }

        const skip = (currentPage - 1) * limit;

        const users = await User.find(query)
            .sort({ createdAt: -1 })
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

        const customer = {
            ...user.toObject(),
            totalOrders: 0,
            lifetimeValue: 0,
            joinedDate: user.createdAt,
            lastLogin: user.updatedAt
        };

        res.render('admin/customer-details', { customer });
    } catch (error) {
        res.redirect('/admin/customers');
    }
};

// @desc    Render Edit Customer Page
// @route   GET /admin/customers/:id/edit
const renderEditCustomerPage = async (req, res) => {
    try {
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

            dbUser.name = name || dbUser.name;
            dbUser.email = email || dbUser.email;
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

module.exports = {
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
    addCustomer
};
