const User = require('../models/user.model');
const Cart = require('../models/cart.model');
const Wishlist = require('../models/wishlist.model');
const generateReferralCode = require('../utils/generateReferralCode');

const attachSessionUser = async (req, res, next) => {
    try {
        res.locals.cartCount = 0;
        res.locals.wishlistCount = 0;

        if (req.session && req.session.userId) {
            // Fetch user to populate res.locals.user for Navbar
            const [user, cart, wishlist] = await Promise.all([
                User.findById(req.session.userId).select('name email role profileImage isBlocked phone addresses referralCode'),
                Cart.findOne({ userId: req.session.userId }).select('items.quantity'),
                Wishlist.findOne({ user: req.session.userId }).select('items.variantId')
            ]);
            console.log("MIDDLEWARE → DB user fetched:", user?.name, user?.phone);

            if (cart && Array.isArray(cart.items)) {
                res.locals.cartCount = cart.items.reduce((total, item) => total + (Number(item.quantity) || 0), 0);
            }

            if (wishlist && Array.isArray(wishlist.items)) {
                res.locals.wishlistCount = wishlist.items.length;
            }

            if (user) {
                if (!user.referralCode) {
                    try {
                        const generatedReferralCode = generateReferralCode(user);
                        const updatedUser = await User.findOneAndUpdate(
                            { _id: user._id, referralCode: { $in: [null, ''] } },
                            { $set: { referralCode: generatedReferralCode } },
                            { new: true }
                        ).select('name email role profileImage isBlocked phone addresses referralCode');

                        if (updatedUser) {
                            user.referralCode = updatedUser.referralCode;
                        } else {
                            const existingUser = await User.findById(user._id).select('referralCode');
                            if (existingUser && existingUser.referralCode) {
                                user.referralCode = existingUser.referralCode;
                            }
                        }
                    } catch (error) {
                        console.error('Failed to generate referral code for user:', user._id, error.message);
                    }
                }

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

                user.addresses = Array.isArray(user.addresses) ? user.addresses : [];
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
            res.locals.cartCount = 0;
            res.locals.wishlistCount = 0;
        }
    } catch (err) {
        console.error('Session User Fetch Error:', err);
        res.locals.user = null;
        res.locals.role = null;
        res.locals.cartCount = 0;
        res.locals.wishlistCount = 0;
    }
    next();
};

module.exports = attachSessionUser;
