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
                callbackURL: process.env.GOOGLE_CALLBACK_URL,
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

                    // Step 2: Find active (non-deleted) user by email and preserve the stored role
                    if (email) {
                        user = await User.findOne({ email: email.toLowerCase().trim(), isDeleted: { $ne: true } });

                        if (user) {
                            if (user.isBlocked) return done(new Error('User account is blocked'), null);

                            if (!user.googleId) {
                                user.googleId = profile.id;
                            }

                            // Update profile image if empty or default
                            if (googlePhoto && !user.profileImage) {
                                user.profileImage = googlePhoto;
                            }

                            if (!user.isVerified) {
                                user.isVerified = true;
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
                        email: email ? email.toLowerCase().trim() : email,
                        profileImage: googlePhoto || null,
                        role: 'user',
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
};

module.exports = configurePassport;
