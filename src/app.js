const express = require('express');
const session = require('express-session');
const path = require('path');
const passport = require('passport');
const configurePassport = require('./config/passport');
const connectDB = require('./config/db');
const authRoutes = require('./routes/auth.routes');
const profileRoutes = require('./routes/profile.routes');
const adminRoutes = require('./routes/admin.routes');

const { getHomePage, getPostLoginHomePage } = require('./controllers/home.controller');
const nocache = require('./middleware/nocache.middleware');
require('dotenv').config();

const app = express();

// Connect to Database
connectDB();

// Middleware
app.use(nocache);
app.use(express.json());

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

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/admin', adminRoutes);

app.get('/', getHomePage);
app.get('/home', getPostLoginHomePage);

// View Routes
app.get('/login', (req, res) => {
    res.render('login');
});

app.get('/signup', (req, res) => {
    res.render('auth/signup');
});

app.get('/verify-otp', (req, res) => {
    res.render('auth/otp');
});

app.get('/forgot-password', (req, res) => {
    res.render('auth/forgot-password');
});

app.get('/reset-password', (req, res) => {
    res.render('auth/reset-password');
});

app.get('/password-success', (req, res) => {
    res.render('auth/password-success');
});

const PORT = process.env.PORT || 5000;

module.exports = app;
