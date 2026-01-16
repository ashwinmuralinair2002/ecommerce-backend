const jwt = require('jsonwebtoken');
const User = require('../models/user.model');

const protectAdmin = async (req, res, next) => {
    let token;

    if (req.cookies.token) {
        token = req.cookies.token;
    } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return res.redirect('/login');
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Handle Hardcoded Admin
        if (decoded.role === 'admin' && decoded.id === 'admin') {
            req.user = { id: 'admin', role: 'admin', name: 'Ashwin Murali Nair', email: process.env.ADMIN_EMAIL };
            return next();
        }

        const user = await User.findById(decoded.id).select('-password');

        if (!user || user.role !== 'admin') {
            // Not admin or not found
            return res.redirect('/login');
        }

        req.user = user;
        next();

    } catch (error) {
        console.error('Admin Auth Error:', error.message);
        res.clearCookie('token');
        return res.redirect('/login');
    }
};

module.exports = { protectAdmin };
