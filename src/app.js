// Main application setup and middleware configuration
const express = require('express');
const session = require('express-session');
const path = require('path');
const passport = require('passport');
const configurePassport = require('./config/passport');
const connectDB = require('./config/db');
const authRoutes = require('./routes/auth.routes');
const profileRoutes = require('./routes/profile.routes');
const addressRoutes = require('./routes/address.routes');

const { getHomePage, getPostLoginHomePage } = require('./controllers/home.controller');
const productController = require('./controllers/admin.product.controller');
const userProductController = require('./controllers/user.product.controller');
const userRoutes = require('./routes/user.routes');
const productUpload = require('./config/multerUpload');
const categoryUpload = require('./middleware/category-upload.middleware');
const nocache = require('./middleware/nocache.middleware');
require('dotenv').config();

const app = express();
// Middleware
app.use(nocache);
// cookie-parser removed
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request Logger
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    next();
});



// Session Middleware (Required for Google Strategy State)
app.use(session({
    secret: process.env.JWT_SECRET || 'secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // Secure in production
        sameSite: 'lax', // Recommended for auth cookies
        path: '/',
        maxAge: 1000 * 60 * 60 * 24 // 24 hours
    }
}));

// Passport Config
configurePassport();
app.use(passport.initialize());
// Passport Session removed - using manual session management

// Global User Middleware (Available in all views)
const User = require('./models/user.model');
app.use(async (req, res, next) => {
    try {
        if (req.session && req.session.userId) {
            // Fetch user to populate res.locals.user for Navbar
            const user = await User.findById(req.session.userId).select('name email role profileImage isBlocked');

            if (user) {
                // Check if user is blocked - OPTIONAL: Force logout here if strictly required, 
                // but let's stick to just exposing data for now to avoid side-effects in GET requests unless critical.
                // However, for security, if they are blocked, we should probably kill the session.
                if (user.isBlocked) {
                    req.session.destroy((err) => {
                        if (err) console.error('Session destroy error during block check:', err);
                        res.locals.user = null;
                        res.locals.role = null;
                        res.clearCookie('connect.sid');
                        // We can't easily redirect inside a global middleware without potentially disrupting non-html requests
                        // So we just nullify. The auth-check middleware will catch them on protected routes.
                        next();
                    });
                    return; // Stop processing this middleware instance
                }

                res.locals.user = user;
                res.locals.role = user.role;
                req.user = user; // Attach for legacy compatibility/passport-like access
            } else {
                // Ghost Session: Session has ID but User not in DB (deleted?)
                console.warn(`Ghost session detected for userId: ${req.session.userId}. Destroying.`);
                req.session.destroy((err) => {
                    if (err) console.error('Session destroy error:', err);
                    res.locals.user = null;
                    res.locals.role = null;
                    res.clearCookie('connect.sid');
                    next();
                });
                return;
            }
        } else {
            res.locals.user = null;
            res.locals.role = null;
        }
    } catch (err) {
        console.error('Session User Fetch Error:', err);
        res.locals.user = null;
        res.locals.role = null;
    }
    next();
});

// View Engine Setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.static(path.join(__dirname, 'public'))); // For uploads
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// DEV MODE OVERRIDE: Intercept responses to inject OTP
// User model already required above
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

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);

// View Routes - Address Management
app.use(addressRoutes);

const { ensureAuthenticated, ensureOtpVerified, ensureGuest } = require('./middleware/auth-check.middleware');

app.get('/', getHomePage);
app.get('/home', ensureAuthenticated, ensureOtpVerified, (req, res, next) => {
    if (req.session.role === 'admin') {
        return res.redirect('/admin/dashboard');
    }
    next();
}, getPostLoginHomePage);

// User Product Routes
app.use('/', userRoutes);

// View Routes
app.get('/account', require('./middleware/auth-check.middleware').ensureAuthenticated, (req, res) => {
    res.render('user-account', { user: req.user || {} });
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

const categoryController = require('./controllers/admin.category.controller');
app.get('/admin/categories', ensureAdminAuthenticated, categoryController.getCategoriesPage);
app.get('/admin/categories/add', ensureAdminAuthenticated, categoryController.renderAddCategory);
app.post('/admin/categories', ensureAdminAuthenticated, categoryUpload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'heroImage', maxCount: 1 }
]), categoryController.addCategory);
app.get('/admin/categories/:id', ensureAdminAuthenticated, categoryController.getCategoryDetails);
app.get('/admin/categories/:id/edit', ensureAdminAuthenticated, categoryController.renderEditCategory);
app.post('/admin/categories/:id/edit', ensureAdminAuthenticated, categoryUpload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'heroImage', maxCount: 1 }
]), categoryController.editCategory);
app.post('/admin/categories/:id/block-toggle', ensureAdminAuthenticated, categoryController.toggleCategoryBlock);
app.post('/admin/categories/:id/delete', ensureAdminAuthenticated, categoryController.deleteCategory);

// Admin Product Management
app.get('/admin/products', ensureAdminAuthenticated, productController.getProductsPage);
app.get('/admin/products/add', ensureAdminAuthenticated, productController.getAddProductPage);
app.get('/admin/products/edit/:id', ensureAdminAuthenticated, productController.getEditProductPage);
app.post('/admin/products', ensureAdminAuthenticated, productUpload.any(), productController.createProduct);
app.put('/admin/products/:id', ensureAdminAuthenticated, productUpload.any(), productController.updateProduct);
app.delete('/admin/products/:id/images/:imageId', ensureAdminAuthenticated, productController.deleteProductImage);
app.post('/admin/products/soft-delete', ensureAdminAuthenticated, productController.softDeleteProducts);
app.delete('/admin/products/:id', ensureAdminAuthenticated, productController.softDeleteProduct);
app.patch('/admin/products/:id/toggle-list', ensureAdminAuthenticated, productController.toggleProductListing);
app.get('/admin/products/:id', ensureAdminAuthenticated, productController.getProductDetailPage);

app.get('/login', ensureGuest, (req, res) => {
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
