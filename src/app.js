// Main application setup and middleware configuration
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
console.log('--- APP IDENTITY VERIFIED: faa11254 ---');
connectDB();

// Middleware
app.use(nocache);
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request Logger
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    next();
});

// Global User Middleware (Available in all views)
app.use((req, res, next) => {
    res.locals.user = req.user || null;
    next();
});

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

// DEV MODE OVERRIDE: Intercept responses to inject OTP
const User = require('./models/user.model');
app.use((req, res, next) => {
    const originalJson = res.json;
    res.json = function (body) {
        if (process.env.NODE_ENV !== 'production' && body) {
            const isAuthSignup = req.url.includes('/signup') && body.user && body.user.email;
            const isAuthResend = req.url.includes('/resend-otp') && req.body.email; // Body parsed by now

            // Note: req.url for app.use('/api/auth') might be just '/signup' or full path depending on mounting.
            // But we are at app level middleware before mounting?
            // Actually app.use middleware sees full url if mounted at root?
            // Let's assume req.originalUrl is safer.

            const target = req.originalUrl;
            const isTarget = target.includes('/api/auth/signup') || target.includes('/api/auth/resend-otp');

            if (isTarget) {
                const targetEmail = (body.user && body.user.email) || (req.body && req.body.email);
                if (targetEmail) {
                    console.error('--- INTERCEPTING RESPONSE FOR:', targetEmail, '---');
                    User.findOne({ email: targetEmail }).then(user => {
                        if (user && user.otp) {
                            body.devOtp = user.otp;
                            console.error('--- INJECTED OTP:', user.otp, '---');
                        }
                        originalJson.call(this, body);
                    }).catch(err => {
                        console.error('--- OTP INJECTION FAILED:', err);
                        originalJson.call(this, body);
                    });
                    return;
                }
            }
        }
        return originalJson.call(this, body);
    };
    next();
});

// Admin Dashboard Route Removed (Duplicate/Incorrect) - Handled below using correct middleware

// Protected routes using JWT for API calls
// const authRoutes = require('./routes/auth.routes'); // Already imported above
console.log('--- AUTH ROUTES IMPORTED ---', typeof authRoutes);
if (authRoutes.stack) {
    authRoutes.stack.forEach(r => {
        if (r.route && r.route.path) {
            console.log('ROUTE:', r.route.path);
        }
    });
}
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

app.post('/account/addresses/:id/delete', require('./middleware/auth-check.middleware').ensureAuthenticated, async (req, res) => {
    try {
        const profileService = require('./services/profile.service');
        await profileService.deleteAddress(req.user.id, req.params.id);
        res.redirect('/account/addresses');
    } catch (error) {
        console.error(error);
        res.status(500).send('Error deleting address: ' + error.message);
    }
});

const { ensureAdminAuthenticated } = require('./middleware/admin-auth.middleware');

app.get('/admin/dashboard',
    ensureAdminAuthenticated,
    (req, res) => {
        res.render('admin/dashboard');
    }
);

const adminController = require('./controllers/admin.controller');

app.get('/admin/customers', ensureAdminAuthenticated, adminController.getCustomersPage);
app.get('/admin/customers/add', ensureAdminAuthenticated, adminController.renderAddCustomerPage);
app.post('/admin/customers/add', ensureAdminAuthenticated, adminController.addCustomer);
app.get('/admin/customers/export', ensureAdminAuthenticated, adminController.exportCustomers);
app.get('/admin/customers/:id', ensureAdminAuthenticated, adminController.getCustomerDetails);
app.get('/admin/customers/:id/orders', ensureAdminAuthenticated, adminController.getCustomerOrders);
app.get('/admin/customers/:id/edit', ensureAdminAuthenticated, adminController.renderEditCustomerPage);
app.post('/admin/customers/:id/update', ensureAdminAuthenticated, adminController.updateCustomer);
app.post('/admin/customers/:id/notes', ensureAdminAuthenticated, adminController.updateAdminNotes);
app.post('/admin/customers/:id/toggle-block', ensureAdminAuthenticated, adminController.toggleBlockUser);
app.get('/admin/customers/:id/delete', ensureAdminAuthenticated, adminController.softDeleteUser);
app.post('/admin/customers/:id/delete', ensureAdminAuthenticated, adminController.softDeleteUser); // Fix: Ensure POST method exists for deletion
app.post('/admin/profile/update', ensureAdminAuthenticated, adminController.updateAdminProfile);
app.get('/admin/change-password', ensureAdminAuthenticated, adminController.getChangePasswordPage);
app.post('/admin/change-password', ensureAdminAuthenticated, adminController.changeAdminPassword);

const brandController = require('./controllers/admin.brand.controller');
const brandUpload = require('./middleware/brand-upload.middleware');

app.get('/admin/brands', ensureAdminAuthenticated, brandController.getBrands);
app.get('/admin/brands/add', ensureAdminAuthenticated, brandController.renderAddBrand);
app.post('/admin/brands', ensureAdminAuthenticated, brandUpload.single('logo'), brandController.addBrand);
app.get('/admin/brands/:id', ensureAdminAuthenticated, brandController.getBrandDetails);
app.get('/admin/brands/:id/edit', ensureAdminAuthenticated, brandController.renderEditBrand);
app.post('/admin/brands/:id/edit', ensureAdminAuthenticated, brandUpload.single('logo'), brandController.editBrand);
app.post('/admin/brands/:id/toggle-status', ensureAdminAuthenticated, brandController.toggleBrandStatus);
app.post('/admin/brands/:id/delete', ensureAdminAuthenticated, brandController.deleteBrand);


app.get('/login', (req, res) => {
    res.render('login');
});

app.get('/signup', ensureGuest, (req, res) => {
    res.render('auth/signup');
});

app.get('/verify-otp', (req, res) => {
    // Pass session email (primary) or query email (fallback)
    const email = req.session.otpEmail || req.query.email || '';
    res.render('auth/otp', { email });
});

app.get('/account/change-password', require('./middleware/auth-check.middleware').ensureAuthenticated, (req, res) => {
    res.render('change-password', { user: req.user });
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

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('Unhandled Error:', err);
    res.status(500).json({ error: err.message || 'Server Error' });
});

module.exports = app;
