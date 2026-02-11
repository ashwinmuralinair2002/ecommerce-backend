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
                    const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
                    const googlePhoto = profile.photos && profile.photos.length > 0
                        ? profile.photos[0].value
                        : null;

                    // Step 1: Find active (non-deleted) user by googleId
                    let user = await User.findOne({ googleId: profile.id, isDeleted: { $ne: true } });

                    if (user) {
                        if (user.isBlocked) return done(new Error('User account is blocked'), null);
                        // Update profile image if empty or default
                        if (googlePhoto && !user.profileImage) {
                            user.profileImage = googlePhoto;
                            await user.save();
                        }
                        return done(null, user);
                    }

                    // Step 2: Find active (non-deleted) user by email — link Google account
                    if (email) {
                        user = await User.findOne({ email: email, isDeleted: { $ne: true } });

                        if (user) {
                            if (user.isBlocked) return done(new Error('User account is blocked'), null);
                            user.googleId = profile.id;
                            // Update profile image if empty or default
                            if (googlePhoto && !user.profileImage) {
                                user.profileImage = googlePhoto;
                            }
                            await user.save();
                            return done(null, user);
                        }
                    }

                    // Step 3: Clear googleId from any deleted users with same googleId
                    // (so the unique sparse index doesn't conflict)
                    await User.updateMany(
                        { googleId: profile.id, isDeleted: true },
                        { $unset: { googleId: '' } }
                    );

                    // Step 4: Create a brand new user
                    user = await User.create({
                        googleId: profile.id,
                        name: profile.displayName,
                        email: email,
                        profileImage: googlePhoto || null,
                        isVerified: true,
                        isDeleted: false,
                        isBlocked: false,
                        lastOtpSentAt: Date.now(),
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
            // Reject deleted or blocked users during deserialization
            if (!user || user.isDeleted || user.isBlocked) {
                return done(null, false);
            }
            done(null, user);
        } catch (err) {
            done(err, null);
        }
    });
};

module.exports = configurePassport;
