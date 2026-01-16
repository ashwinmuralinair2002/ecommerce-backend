const User = require('../models/user.model');
const Order = require('../models/order.model');
const { Parser } = require('json2csv');

// @desc    Get Customers Page
// @route   GET /admin/customers
const getCustomersPage = async (req, res) => {
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

        // Augment users with dummy stats as requested
        const augmentedUsers = users.map(user => ({
            ...user.toObject(),
            totalOrders: 0, // Placeholder
            lifetimeValue: 0, // Placeholder
            lastActive: user.updatedAt // Placeholder using updatedAt
        }));

        res.render('admin/customers', { consumers: augmentedUsers, search: search || '' });
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
    updateAdminProfile
};
