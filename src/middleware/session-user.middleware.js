const User = require('../models/user.model');

const attachSessionUser = async (req, res, next) => {
    try {
        if (req.session && req.session.userId) {
            // Fetch user to populate res.locals.user for Navbar
            const user = await User.findById(req.session.userId).select('name email role profileImage isBlocked');
            console.log("MIDDLEWARE → DB user fetched:", user?.name, user?.phone);

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
};

module.exports = attachSessionUser;
