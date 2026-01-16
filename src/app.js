const express = require('express');
const session = require('express-session');
const path = require('path');
const passport = require('passport');
const configurePassport = require('./config/passport');
const connectDB = require('./config/db');
const authRoutes = require('./routes/auth.routes');
const profileRoutes = require('./routes/profile.routes');
// const adminRoutes = require('./routes/admin.routes');

const { getHomePage, getPostLoginHomePage } = require('./controllers/home.controller');
const nocache = require('./middleware/nocache.middleware');
require('dotenv').config();

const app = express();
const cookieParser = require('cookie-parser');

// Connect to Database
connectDB();

// Middleware
app.use(nocache);
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session Middleware (Required for Google Strategy State)
app.use(session({
    secret: process.env.JWT_SECRET || 'secret',
    resave: false,
    saveUninitialized: false
}));

// Passport Config
configurePassport();
app.use(passport.initialize());
app.use(passport.session());

// View Engine Setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.static(path.join(__dirname, 'public'))); // For uploads
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// Admin Dashboard
app.get('/admin/dashboard',
    require('./middleware/auth-check.middleware').ensureAuthenticated,
    require('./middleware/auth.middleware').isAdmin,
    (req, res) => {
        res.render('admin/dashboard');
    }
);

// Protected routes using JWT for API calls
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
// app.use('/api/admin', adminRoutes);

const { ensureAuthenticated, ensureOtpVerified, ensureGuest } = require('./middleware/auth-check.middleware');

app.get('/', getHomePage);
app.get('/home', ensureAuthenticated, ensureOtpVerified, getPostLoginHomePage);

// View Routes
app.get('/account', require('./middleware/auth-check.middleware').ensureAuthenticated, (req, res) => {
    res.render('user-account', { user: req.user || {} });
});

app.get('/account/addresses', require('./middleware/auth-check.middleware').ensureAuthenticated, (req, res) => {
    res.render('user-addresses', { user: req.user || {} });
});

app.get('/account/addresses/new', require('./middleware/auth-check.middleware').ensureAuthenticated, (req, res) => {
    res.render('add-address', { user: req.user || {} });
});

app.post('/account/addresses', require('./middleware/auth-check.middleware').ensureAuthenticated, async (req, res) => {
    const { name, phone, houseNo, street, city, state, postalCode, label } = req.body;

    // Server-side validation
    if (!name || !phone || !houseNo || !street || !city || !state || !postalCode || !label) {
        return res.status(400).send('All fields are required');
    }

    try {
        const profileService = require('./services/profile.service');
        // Map to schema-compatible object + extra fields
        // Since "NO DB CHANGES YET", we try to respect the prompt's data model in the payload
        // but map strict schema fields (zip -> postalCode)
        const addressData = {
            street: `${houseNo}, ${street}`, // Combining purely to satisfy schema strictness if needed, or just pass 'street'
            city,
            state,
            zip: postalCode,
            country: 'India', // Default required by schema
            isDefault: false,
            // Pass pure fields too if schema allows mixed/flexible or if avoiding accidental data loss
            name,
            phone,
            label,
            houseNo,
            originalStreet: street
        };

        // Note: profileService.addAddress expects { street, city, state, zip }
        // We are passing extra fields which will be stripped by Mongoose unless schema is changed
        await profileService.addAddress(req.user.id, addressData);

        res.redirect('/account/addresses');
    } catch (error) {
        console.error(error);
        res.status(500).send('Error adding address: ' + error.message);
    }
});

app.get('/account/addresses/:id/edit', require('./middleware/auth-check.middleware').ensureAuthenticated, (req, res) => {
    const address = req.user.addresses.id(req.params.id);
    if (!address) {
        return res.redirect('/account/addresses');
    }
    res.render('edit-address', { user: req.user, address });
});

const adminAuth = require('./middleware/admin-auth.middleware');

app.get('/admin/dashboard',
    adminAuth.protectAdmin,
    (req, res) => {
        res.render('admin/dashboard');
    }
);

const adminController = require('./controllers/admin.controller');

app.get('/admin/customers', adminAuth.protectAdmin, adminController.getCustomersPage);
app.get('/admin/customers/export', adminAuth.protectAdmin, adminController.exportCustomers);
app.get('/admin/customers/:id', adminAuth.protectAdmin, adminController.getCustomerDetails);
app.get('/admin/customers/:id/orders', adminAuth.protectAdmin, adminController.getCustomerOrders);
app.get('/admin/customers/:id/edit', adminAuth.protectAdmin, adminController.renderEditCustomerPage);
app.post('/admin/customers/:id/update', adminAuth.protectAdmin, adminController.updateCustomer);
app.post('/admin/customers/:id/notes', adminAuth.protectAdmin, adminController.updateAdminNotes);
app.post('/admin/customers/:id/toggle-block', adminAuth.protectAdmin, adminController.toggleBlockUser);
app.post('/admin/customers/:id/delete', adminAuth.protectAdmin, adminController.softDeleteUser);

const brandController = require('./controllers/admin.brand.controller');
const upload = require('./middleware/upload.middleware');

app.get('/admin/brands', adminAuth.protectAdmin, brandController.getBrands);
app.get('/admin/brands/add', adminAuth.protectAdmin, brandController.renderAddBrand);
app.post('/admin/brands', adminAuth.protectAdmin, upload.single('logo'), brandController.addBrand);
app.get('/admin/brands/:id', adminAuth.protectAdmin, brandController.getBrandDetails);
app.get('/admin/brands/:id/edit', adminAuth.protectAdmin, brandController.renderEditBrand);
app.post('/admin/brands/:id/edit', adminAuth.protectAdmin, brandController.editBrand);
app.post('/admin/brands/:id/toggle-status', adminAuth.protectAdmin, brandController.toggleBrandStatus);
app.post('/admin/brands/:id/delete', adminAuth.protectAdmin, brandController.deleteBrand);

app.post('/account/addresses/:id/update', require('./middleware/auth-check.middleware').ensureAuthenticated, async (req, res) => {
    const { name, phone, houseNo, street, city, state, postalCode, label } = req.body;

    try {
        const profileService = require('./services/profile.service');
        const addressData = {
            name,
            phone,
            houseNo,
            street,
            city,
            state,
            zip: postalCode,
            country: 'India',
            label
        };

        await profileService.updateAddress(req.user.id, req.params.id, addressData);
        res.redirect('/account/addresses');
    } catch (error) {
        console.error(error);
        res.status(500).send('Error updating address: ' + error.message);
    }
});
app.get('/login', (req, res) => {
    res.render('login');
});

app.get('/signup', ensureGuest, (req, res) => {
    res.render('auth/signup');
});

app.get('/verify-otp', ensureGuest, (req, res) => {
    res.render('auth/otp');
});

app.get('/forgot-password', ensureGuest, (req, res) => {
    res.render('auth/forgot-password');
});

app.get('/reset-password', ensureGuest, (req, res) => {
    res.render('auth/reset-password');
});

app.get('/password-success', (req, res) => {
    res.render('auth/password-success');
});

const PORT = process.env.PORT || 5000;

module.exports = app;
