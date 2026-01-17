// Passport.js authentication strategy configuration
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/user.model');
const dotenv = require('dotenv');

dotenv.config();

const configurePassport = () => {
    passport.use(
        new GoogleStrategy(
            {
                clientID: process.env.GOOGLE_CLIENT_ID,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                callbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback',
                scope: ['profile', 'email'],
            },
            async (accessToken, refreshToken, profile, done) => {
                try {
                    // Check if user exists
                    let user = await User.findOne({ googleId: profile.id });

                    if (user) {
                        if (user.isBlocked) return done(new Error('User account is blocked'), null);
                        return done(null, user);
                    }

                    // Check if user exists with same email (link account)
                    if (profile.emails && profile.emails.length > 0) {
                        user = await User.findOne({ email: profile.emails[0].value });

                        if (user) {
                            if (user.isBlocked) return done(new Error('User account is blocked'), null);
                            user.googleId = profile.id;
                            await user.save();
                            return done(null, user);
                        }
                    }

                    // Create new user
                    user = await User.create({
                        googleId: profile.id,
                        name: profile.displayName,
                        email: profile.emails[0].value,
                        password: '', // No password for Google users
                        isVerified: true, // Auto-verify Google users
                        lastOtpSentAt: Date.now(), // Prevent null errors if used elsewhere
                    });

                    return done(null, user);
                } catch (error) {
                    return done(error, null);
                }
            }
        )
    );

    passport.serializeUser((user, done) => {
        done(null, user.id);
    });

    passport.deserializeUser(async (id, done) => {
        try {
            const user = await User.findById(id);
            done(null, user);
        } catch (err) {
            done(err, null);
        }
    });
};

module.exports = configurePassport;
