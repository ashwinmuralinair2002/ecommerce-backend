// Main application setup and middleware configuration
const express = require('express');
const session = require('express-session');
const methodOverride = require('method-override');
const path = require('path');
const passport = require('passport');
const configurePassport = require('./config/passport');
const connectDB = require('./config/db');
const authRoutes = require('./routes/auth.routes');
const profileRoutes = require('./routes/profile.routes');
const addressRoutes = require('./routes/address.routes');
const homeRoutes = require('./routes/home.routes');
const accountRoutes = require('./routes/account.routes');
const authPagesRoutes = require('./routes/auth-pages.routes');
const adminWebRoutes = require('./routes/admin-web.routes');
const adminHeroRoutes = require('./routes/admin.hero.routes');

const { getHomePage } = require('./controllers/home.controller');
const userRoutes = require('./routes/user.routes');
const nocache = require('./middleware/nocache.middleware');
const requestLogger = require('./middleware/request-logger.middleware');
const attachSessionUser = require('./middleware/session-user.middleware');
const injectDevOtp = require('./middleware/dev-otp-inject.middleware');
const globalErrorHandler = require('./middleware/error-handler.middleware');
require('dotenv').config();

const app = express();
// Middleware
app.use(nocache);
// cookie-parser removed
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));

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

// View Routes
app.use(addressRoutes);
app.use(homeRoutes);
app.use('/account', accountRoutes);
app.use(authPagesRoutes);
app.use('/admin', adminWebRoutes);
app.use(adminHeroRoutes);
app.use('/', userRoutes);

app.get('/', getHomePage);

const PORT = process.env.PORT || 5000;

// Global Error Handler
app.use(globalErrorHandler);

module.exports = app;
