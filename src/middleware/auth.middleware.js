const jwt = require('jsonwebtoken');
const User = require('../models/user.model');

const verifyToken = async (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        try {
            token = req.headers.authorization.split(' ')[1];
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);

                // Optional: Fetch user to check isBlocked status dynamically
                // This makes every request hit DB but improves security for blocking active users
                const user = await User.findById(decoded.id).select('-password');

                if (!user) {
                    return res.status(401).json({ error: 'User not found' });
                }

                if (user.isBlocked) {
                    return res.status(403).json({ error: 'User account is blocked' });
                }

                req.user = user; // Attach full user object
                next();
            } catch (error) {
                if (error.name === 'TokenExpiredError') {
                    return res.status(401).json({ error: 'Token expired' });
                }
                return res.status(401).json({ error: 'Not authorized, token failed' });
            }
        } catch (error) {
            console.error(error);
            return res.status(401).json({ error: 'Not authorized, token failed' });
        }
    }

    if (!token) {
        return res.status(401).json({ error: 'No token provided, authorization denied' });
    }
};

const isAdmin = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);
        if (user && user.role === 'admin') {
            next();
        } else {
            res.status(403).json({ error: 'Not authorized as an admin' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Server error during admin check' });
    }
};

module.exports = { verifyToken, isAdmin };
