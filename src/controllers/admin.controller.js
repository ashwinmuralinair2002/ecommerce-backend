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
        const limit = 5; // 5 customers per page
        const currentPage = parseInt(page) || 1;

        let query = { role: 'user', deleted: false };

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } },
            ];
        }

        // Get total count for pagination
        const totalCustomers = await User.countDocuments(query);
        const totalPages = Math.ceil(totalCustomers / limit);
        const skip = (currentPage - 1) * limit;

        const users = await User.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // Augment users with dummy stats as requested
        const augmentedUsers = users.map(user => ({
            ...user.toObject(),
            totalOrders: 0, // Placeholder
            lifetimeValue: 0, // Placeholder
            lastActive: user.updatedAt // Placeholder using updatedAt
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
        console.error(error);
        res.status(500).send('Server Error');
    }
};

// @desc    Toggle Block User
// @route   POST /admin/customers/:id/toggle-block
const toggleBlockUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Prevent blocking admin (though query usually filters them out, safety check)
        if (user.role === 'admin') {
            return res.status(403).json({ error: 'Cannot block admin' });
        }

        user.isBlocked = !user.isBlocked;
        await user.save();

        res.json({ success: true, isBlocked: user.isBlocked });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server Error' });
    }
};

// @desc    Soft Delete User
// @route   POST /admin/customers/:id/delete
const softDeleteUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        user.deleted = true;
        await user.save();

        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server Error' });
    }
};

// @desc    Get Customer Details Page
// @route   GET /admin/customers/:id
const getCustomerDetails = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user || user.role === 'admin' || user.deleted) {
            return res.status(404).render('404', { message: 'Customer not found' });
        }

        // Augment with stats
        const customer = {
            ...user.toObject(),
            totalOrders: 0, // Placeholder
            lifetimeValue: 0, // Placeholder
            joinedDate: user.createdAt,
            lastLogin: user.updatedAt // Placeholder
        };

        res.render('admin/customer-details', { customer });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};

// @desc    Render Edit Customer Page
// @route   GET /admin/customers/:id/edit
const renderEditCustomerPage = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user || user.role === 'admin' || user.deleted) {
            return res.status(404).render('404', { message: 'Customer not found' });
        }
        res.render('admin/edit-customer', { customer: user });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
}

// @desc    Update Customer Profile
// @route   POST /admin/customers/:id/update
const updateCustomer = async (req, res) => {
    try {
        const { name, email, phone } = req.body;
        const user = await User.findById(req.params.id);

        if (!user || user.role === 'admin' || user.deleted) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        user.name = name || user.name;
        user.email = email || user.email;
        user.phone = phone || user.phone;

        await user.save();
        res.redirect(`/admin/customers/${user._id}`);
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};

// @desc    Update Admin Notes
// @route   POST /admin/customers/:id/notes
const updateAdminNotes = async (req, res) => {
    try {
        const { adminNotes } = req.body;
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        user.adminNotes = adminNotes;
        await user.save();

        res.json({ success: true, message: 'Notes updated' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server Error' });
    }
};

// @desc    Export Customers to CSV
// @route   GET /admin/customers/export
const exportCustomers = async (req, res) => {
    try {
        const { search } = req.query;
        let query = { role: 'user', deleted: false };

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
            console.error(err);
            return res.status(500).send('Error generating CSV');
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};

// @desc    Get Customer Orders Page
// @route   GET /admin/customers/:id/orders
const getCustomerOrders = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user || user.role === 'admin' || user.deleted) {
            return res.status(404).render('404', { message: 'Customer not found' });
        }

        const orders = await Order.find({ user: user._id, deleted: false }).sort({ createdAt: -1 });

        res.render('admin/customer-orders', { customer: user, orders });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};

// @desc    Update Admin Profile
// @route   POST /admin/profile/update
// @desc    Update Admin Profile
// @route   POST /admin/profile/update
const updateAdminProfile = async (req, res) => {
    try {
        const { name, email, phone } = req.body;

        // Basic Validation
        if (!email || !email.includes('@')) {
            console.error('Update Failed: Invalid Email');
            if (req.headers['content-type'] === 'application/x-www-form-urlencoded') {
                return res.redirect('back');
            }
            return res.status(400).json({ error: 'Invalid email' });
        }

        let updatedUser = {};

        // Case 1: DB-Based Admin (Has a valid MongoDB _id)
        if (req.user && req.user._id) {
            const dbUser = await User.findById(req.user._id);
            if (!dbUser) {
                return res.status(404).json({ error: 'User not found in DB' });
            }

            dbUser.name = name || dbUser.name;
            dbUser.email = email || dbUser.email;
            dbUser.phone = phone !== undefined ? phone : dbUser.phone;

            await dbUser.save();
            updatedUser = dbUser.toObject();

            console.log('[Admin Profile] DB Admin updated:', { name: dbUser.name, email: dbUser.email, phone: dbUser.phone });

            // Update Session to reflect changes immediately
            if (req.session) {
                req.session.adminName = dbUser.name;
                req.session.adminEmail = dbUser.email;
                req.session.adminPhone = dbUser.phone;
                await new Promise((resolve) => req.session.save(resolve));
            }
        }
        // Case 2: Env-Based Admin (No DB record, just Session/Env identity)
        else {
            // Update Session to reflect changes in UI for this session
            if (req.session) {
                req.session.adminName = name || req.user.name;
                req.session.adminEmail = email || req.user.email;
                req.session.adminPhone = phone !== undefined ? phone : req.user.phone;

                // Capture updated values for response
                updatedUser = {
                    name: req.session.adminName,
                    email: req.session.adminEmail,
                    phone: req.session.adminPhone
                };

                // Await session save to ensure persistence before redirect/response
                await new Promise((resolve, reject) => {
                    req.session.save(err => {
                        if (err) {
                            console.error('Session Save Error:', err);
                            reject(err);
                        } else {
                            console.log('[Admin Profile] Session saved:', {
                                adminName: req.session.adminName,
                                adminEmail: req.session.adminEmail,
                                adminPhone: req.session.adminPhone
                            });
                            resolve();
                        }
                    });
                });
            } else {
                // Fallback if session is missing (unlikely in admin route)
                updatedUser = { name, email, phone };
            }
        }

        // If request is from a form submission, redirect back
        if (req.headers['content-type'] === 'application/x-www-form-urlencoded') {
            return res.redirect('back');
        }

        // Return updated user data (Safe for both DB and Env admins)
        res.json({
            success: true,
            user: {
                name: updatedUser.name,
                email: updatedUser.email,
                phone: updatedUser.phone
            }
        });

    } catch (error) {
        console.error('Admin Profile Update Error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
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

        // Validate new password length
        if (!newPassword || newPassword.length < 8) {
            return res.render('admin/change-password', {
                message: 'New password must be at least 8 characters',
                messageType: 'error'
            });
        }

        // Validate passwords match
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

            // Verify current password
            const isMatch = await bcrypt.compare(currentPassword, user.password);
            if (!isMatch) {
                return res.render('admin/change-password', {
                    message: 'Current password is incorrect',
                    messageType: 'error'
                });
            }

            // Hash and save new password
            const salt = await bcrypt.genSalt(10);
            user.password = await bcrypt.hash(newPassword, salt);
            await user.save();

            console.log('[Admin Password] DB Admin password updated');
            return res.redirect('/admin/dashboard?passwordChanged=true');
        }
        // Case 2: Env-Based Admin - Create/update DB record for password persistence
        else {
            const adminEmail = req.session.adminEmail || process.env.ADMIN_EMAIL;
            const adminName = req.session.adminName || process.env.ADMIN_NAME || 'Admin';

            // Check if DB record exists for this admin email
            let adminUser = await User.findOne({ email: adminEmail });

            if (adminUser) {
                // Admin exists in DB - verify current password against DB hash
                const isMatch = await bcrypt.compare(currentPassword, adminUser.password);
                if (!isMatch) {
                    // Also check against env password for backwards compatibility
                    const envPassword = process.env.ADMIN_PASSWORD;
                    if (currentPassword !== envPassword) {
                        return res.render('admin/change-password', {
                            message: 'Current password is incorrect',
                            messageType: 'error'
                        });
                    }
                }

                // Update password in DB
                const salt = await bcrypt.genSalt(10);
                adminUser.password = await bcrypt.hash(newPassword, salt);
                await adminUser.save();

                console.log('[Admin Password] Env-based admin password updated in DB');
            } else {
                // No DB record - verify against env password
                const envPassword = process.env.ADMIN_PASSWORD;
                if (currentPassword !== envPassword) {
                    return res.render('admin/change-password', {
                        message: 'Current password is incorrect',
                        messageType: 'error'
                    });
                }

                // Create DB record for admin with new password
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

                console.log('[Admin Password] Created DB record for env-based admin with new password');
            }

            return res.redirect('/admin/dashboard?passwordChanged=true');
        }
    } catch (error) {
        console.error('Admin Password Change Error:', error);
        return res.render('admin/change-password', {
            message: 'An error occurred while changing password',
            messageType: 'error'
        });
    }
};

// @desc    Render Add Customer Page
// @route   GET /admin/customers/add
const renderAddCustomerPage = (req, res) => {
    res.render('admin/add-customer', { message: null, messageType: null });
};

// @desc    Add New Customer
// @route   POST /admin/customers/add
const addCustomer = async (req, res) => {
    try {
        const { name, email, phone, password } = req.body;

        // Validate required fields
        if (!name || !email || !password) {
            return res.render('admin/add-customer', {
                message: 'Name, email, and password are required',
                messageType: 'error'
            });
        }

        // Check if email already exists
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.render('admin/add-customer', {
                message: 'A user with this email already exists',
                messageType: 'error'
            });
        }

        // Validate password length
        if (password.length < 8) {
            return res.render('admin/add-customer', {
                message: 'Password must be at least 8 characters',
                messageType: 'error'
            });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create new user
        const newUser = new User({
            name,
            email: email.toLowerCase(),
            phone: phone || '',
            password: hashedPassword,
            role: 'user',
            isVerified: true, // Admin-created users are pre-verified
            deleted: false,
            isBlocked: false
        });

        await newUser.save();
        console.log('[Admin] New customer created:', email);

        res.redirect('/admin/customers');
    } catch (error) {
        console.error('Add Customer Error:', error);
        return res.render('admin/add-customer', {
            message: 'An error occurred while adding customer',
            messageType: 'error'
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
