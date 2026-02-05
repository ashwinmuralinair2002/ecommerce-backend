// JWT authentication middleware for API protection
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');

const verifyToken = async (req, res, next) => {
    let token;

    // 1. Check Bearer Header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];
        } catch (error) {
            // Ignore format errors here, we'll check token validity later
        }
    }

    // 2. Check Cookie
    if (!token && req.cookies && req.cookies.token) {
        token = req.cookies.token;
    }

    // 3. Verify Token if found
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');

            // Handle Hardcoded Admin
            if (decoded.role === 'admin' && decoded.id === 'admin') {
                req.user = { id: 'admin', role: 'admin', name: 'Ashwin Murali Nair', email: process.env.ADMIN_EMAIL };
                return next();
            }

            // Fetch User
            const user = await User.findById(decoded.id).select('-password');
            if (user) {
                if (user.isBlocked) {
                    return res.status(403).json({ error: 'User account is blocked' });
                }
                req.user = user;
                return next();
            }
        } catch (error) {
            // If token is invalid/expired, we might still fall back to Session (Google Auth) below?
            // Actually, if a token is PRESENT but invalid, we usually reject.
            // But if user has an old token cookie AND a valid passport session... 
            // Better to reject if explicit token fails.
            if (error.name === 'TokenExpiredError') {
                // Try to support session fallback if token expired?
                // No, standard practice: bad token = 401.
                return res.status(401).json({ error: 'Token expired' });
            }
        }
    }

    // 4. Check Passport Session (Google Auth / Session Auth)
    if (req.isAuthenticated && req.isAuthenticated()) {
        if (req.user) {
            if (req.user.isBlocked) {
                return res.status(403).json({ error: 'User account is blocked' });
            }
            return next();
        }
    }

    return res.status(401).json({ error: 'No token provided, authorization denied' });
};

const isAdmin = async (req, res, next) => {
    try {
        if (req.user && req.user.role === 'admin') {
            return next();
        }

        // Fallback for DB users
        if (req.user && req.user.id !== 'admin') {
            const user = await User.findById(req.user.id);
            if (user && user.role === 'admin') {
                return next();
            }
        }

        res.status(403).json({ error: 'Not authorized as an admin' });
    } catch (error) {
        res.status(500).json({ error: 'Server error during admin check' });
    }
};

module.exports = { verifyToken, isAdmin };
