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
const productUpload = require('./middleware/upload.middleware');
const categoryUpload = require('./middleware/category-upload.middleware');
const nocache = require('./middleware/nocache.middleware');
const requestLogger = require('./middleware/request-logger.middleware');
const attachSessionUser = require('./middleware/session-user.middleware');
const injectDevOtp = require('./middleware/dev-otp-inject.middleware');
const redirectAdminHome = require('./middleware/admin-home-redirect.middleware');
const globalErrorHandler = require('./middleware/error-handler.middleware');
require('dotenv').config();

const app = express();
// Middleware
app.use(nocache);
// cookie-parser removed
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request Logger
app.use(requestLogger);



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
app.use(attachSessionUser);

// View Engine Setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.static(path.join(__dirname, 'public'))); // For uploads
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// DEV MODE OVERRIDE: Intercept responses to inject OTP
app.use(injectDevOtp);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);

// View Routes - Address Management
app.use(addressRoutes);

const { ensureAuthenticated, ensureOtpVerified, ensureGuest } = require('./middleware/auth-check.middleware');

app.get('/', getHomePage);
app.get('/home', ensureAuthenticated, ensureOtpVerified, redirectAdminHome, getPostLoginHomePage);

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
app.use(globalErrorHandler);

module.exports = app;
