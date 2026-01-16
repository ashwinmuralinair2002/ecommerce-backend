const User = require('../models/user.model');

const ensureAdminAuthenticated = async (req, res, next) => {
    // Strict Admin Session Check
    if (req.session && req.session.isAdmin === true) {

        try {
            // Attempt to find Admin in DB to support Profile Persistence
            const adminEmail = req.session.adminEmail || process.env.ADMIN_EMAIL;
            const dbAdmin = await User.findOne({ email: adminEmail });

            if (dbAdmin && dbAdmin.role === 'admin') {
                req.user = dbAdmin; // Use DB Record
            } else {
                // Fallback to Hardcoded Mock Object if not in DB yet
                req.user = {
                    id: 'admin',
                    role: 'admin',
                    name: 'Ashwin Murali Nair',
                    email: process.env.ADMIN_EMAIL || 'admin@example.com'
                };
            }
        } catch (error) {
            console.error('Admin DB Lookup Error:', error);
            // Fallback on error to ensure access logic doesn't break
            req.user = {
                id: 'admin',
                role: 'admin',
                name: 'Ashwin Murali Nair',
                email: process.env.ADMIN_EMAIL || 'admin@example.com'
            };
        }

        return next();
    }

    // Auth Failed
    res.redirect('/login');
};

module.exports = { ensureAdminAuthenticated };
