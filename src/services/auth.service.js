// Authentication business logic including OTP and hashing
const bcrypt = require('bcryptjs');
const validator = require("validator");
// JWT removed
const User = require('../models/user.model');
const ReferralConfig = require('../models/referralConfig.model');
const emailService = require('./email.service');
const walletService = require('./wallet.service');
const fs = require('fs');
const AppError = require('../utils/AppError');
const HTTP_STATUS = require('../constants/http-status');

// Helper to generate 6-digit OTP
const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

const createOtpTraceId = (label, email) => {
    return `${label}:${email}:${Date.now()}`;
};

const normalizeIndianPhone = (phone) => {
    const normalizedPhone = String(phone || '').trim().replace(/[\s-]+/g, '');

    if (!validator.isMobilePhone(normalizedPhone, 'en-IN')) {
        throw new AppError('Please provide a valid Indian phone number', HTTP_STATUS.BAD_REQUEST);
    }

    return normalizedPhone.replace(/^(\+91|91)/, '');
};

// Register a new user
const registerUser = async (userData) => {
    try {
        const { name, email, phone, password, referralCode } = userData;
        const normalizedPhone = normalizeIndianPhone(phone);
        const otpTraceId = createOtpTraceId('signup', email);
        console.log('[SIGNUP TRACE] registerUser called with:', {
            name,
            email,
            phone: normalizedPhone,
            hasPassword: !!password,
            hasReferralCode: !!referralCode
        });
        console.log('[OTP TRACE] Signup flow started:', { otpTraceId, email });

        // Check if user exists
        const userExists = await User.findOne({ email });
        console.log('[SIGNUP TRACE] existing user check:', {
            email,
            exists: !!userExists
        });
        if (userExists) {
            throw new AppError('User already exists', HTTP_STATUS.BAD_REQUEST);
        }

        const existingPhoneUser = await User.findOne({ phone: normalizedPhone });
        console.log('[SIGNUP TRACE] existing phone check:', {
            phone: normalizedPhone,
            exists: !!existingPhoneUser
        });
        if (existingPhoneUser) {
            throw new AppError('User already exists with this phone number', HTTP_STATUS.BAD_REQUEST);
        }

        // Hash password
        console.log('[SIGNUP TRACE] hashing password for:', email);
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        console.log('[SIGNUP TRACE] password hashed for:', email);

        // Generate OTP
        const otp = generateOTP();
        const otpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
        console.log('[SIGNUP TRACE] OTP generated for:', email);
        console.log('[OTP TRACE] OTP generated and expiry computed:', {
            otpTraceId,
            email,
            otpLength: otp.length,
            otpExpiresAt: new Date(otpExpires).toISOString()
        });

        // Create user
        console.log('[SIGNUP TRACE] attempting User.create for:', email);
        const user = await User.create({
            name,
            email,
            phone: normalizedPhone,
            password: hashedPassword,
            otp,
            otpExpires,
            lastOtpSentAt: Date.now(),
            isVerified: false
        });
        console.log('[SIGNUP TRACE] User.create succeeded:', {
            userId: user._id,
            email: user.email,
            referralCode: user.referralCode
        });
        console.log('[OTP TRACE] User persisted with OTP fields:', {
            otpTraceId,
            userId: user._id,
            email: user.email,
            hasOtp: !!user.otp,
            otpExpiresAt: user.otpExpires ? new Date(user.otpExpires).toISOString() : null,
            isVerified: user.isVerified
        });

        if (referralCode && !user.hasUsedReferral) {
            try {
                console.log('[SIGNUP TRACE] referral flow entered for:', email);
                const config = await ReferralConfig.findOne();
                console.log('[SIGNUP TRACE] referral config lookup result:', {
                    found: !!config,
                    isActive: config?.isActive,
                    maxReferrals: config?.maxReferrals
                });

                if (config && config.isActive) {
                    const referrer = await User.findOne({ referralCode });
                    console.log('[SIGNUP TRACE] referrer lookup result:', {
                        referralCode,
                        found: !!referrer,
                        referrerId: referrer?._id
                    });

                    if (
                        referrer &&
                        referrer._id.toString() !== user._id.toString() &&
                        referrer.referralCount < config.maxReferrals
                    ) {
                        await walletService.creditWallet(
                            referrer._id,
                            config.referrerReward,
                            'referral_bonus',
                            `REFERRAL_${user._id}_REFERRER`
                        );

                        await walletService.creditWallet(
                            user._id,
                            config.referredUserReward,
                            'referral_bonus',
                            `REFERRAL_${user._id}_USER`
                        );

                        referrer.referralCount += 1;
                        await referrer.save();
                        console.log('[SIGNUP TRACE] referrer reward/save completed:', {
                            referrerId: referrer._id,
                            referralCount: referrer.referralCount
                        });

                        user.referredBy = referrer._id;
                        user.hasUsedReferral = true;
                        await user.save();
                        console.log('[SIGNUP TRACE] referred user save completed:', {
                            userId: user._id,
                            referredBy: user.referredBy,
                            hasUsedReferral: user.hasUsedReferral
                        });
                    }
                }
            } catch (error) {
                console.error('Referral signup reward failed:', error.message);
            }
        }

        if (referralCode && !user.hasUsedReferral) {
            console.log('[SIGNUP TRACE] marking referral as used without reward:', {
                userId: user._id,
                referralCode
            });
            user.hasUsedReferral = true;
            await user.save();
            console.log('[SIGNUP TRACE] referral usage marker saved:', {
                userId: user._id,
                hasUsedReferral: user.hasUsedReferral
            });
        }

        // Send OTP via Email
        console.log('[SIGNUP TRACE] preparing OTP email for:', email);
        console.log('[OTP TRACE] Handing OTP flow to email service:', {
            otpTraceId,
            email,
            subject: 'SoundWave Verification Code'
        });
        if (process.env.NODE_ENV === 'development') {
            console.log(`[OTP] Request started for email: ${email}`);
            console.log(`[OTP] Generated OTP: ${otp}`);
            const debugMsg = `[DEV-OTP] Generated OTP for ${email}: ${otp} | NODE_ENV: ${process.env.NODE_ENV}\n`;
            try {
                fs.appendFileSync('debug_output.txt', debugMsg);
            } catch (e) {
                console.error('Failed to write debug file', e);
            }
            console.log(debugMsg);
        }

        const emailResult = await emailService.sendEmail(
            email,
            'SoundWave Verification Code',
            `Your verification code is ${otp}. It expires in 10 minutes.`,
            otp,
            { otpTraceId, flow: 'signup' }
        );
        console.log('[SIGNUP TRACE] email send result:', {
            email,
            sent: !!emailResult
        });
        console.log('[OTP TRACE] Email service returned to signup flow:', {
            otpTraceId,
            email,
            sendSucceeded: !!emailResult,
            messageId: emailResult?.messageId || null,
            response: emailResult?.response || null
        });
        if (!emailResult && process.env.DEV_OTP_CONSOLE === 'true') {
            console.log(`\n[DEV OTP FALLBACK] OTP for ${email} is: ${otp}\n`);
        }

        return {
            id: user._id,
            name: user.name,
            email: user.email
        };
    } catch (error) {
        console.error('[SIGNUP TRACE] registerUser failed:', {
            name: error?.name,
            message: error?.message,
            code: error?.code,
            stack: error?.stack
        });
        if (error?.code === 11000 && error?.keyPattern?.phone) {
            throw new AppError('Phone number already registered', HTTP_STATUS.BAD_REQUEST);
        }

        if (error instanceof AppError) {
            throw error;
        }

        throw new AppError('Auth service failed', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
};

// OTP Verification
const verifyOtp = async (email, otp) => {
    try {
        const user = await User.findOne({ email });

        if (!user) {
            throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
        }

        if (user.isVerified) {
            throw new AppError('User already verified', HTTP_STATUS.BAD_REQUEST);
        }

        // Not Verified, proceed to verify
        if (user.otp !== otp) {
            throw new AppError('Invalid OTP', HTTP_STATUS.BAD_REQUEST);
        }

        if (user.otpExpires < Date.now()) {
            throw new AppError('OTP expired', HTTP_STATUS.BAD_REQUEST);
        }

        // Success
        user.isVerified = true;
        user.otp = undefined;
        user.otpExpires = undefined;
        await user.save();

        // Token generation removed
        return {
            message: 'Account verified successfully',
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        };
    } catch (error) {
        if (error instanceof AppError) {
            throw error;
        }

        throw new AppError('Auth service failed', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
};

const verifyResetOtp = async (email, otp) => {
    try {
        const user = await User.findOne({ email });

        if (!user) {
            throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
        }

        if (!user.resetOtp) {
            throw new AppError('OTP not found', HTTP_STATUS.BAD_REQUEST);
        }

        if (user.resetOtp !== otp) {
            throw new AppError('Invalid OTP', HTTP_STATUS.BAD_REQUEST);
        }

        if (user.resetOtpExpires < Date.now()) {
            throw new AppError('OTP expired', HTTP_STATUS.BAD_REQUEST);
        }

        return { message: 'OTP verified successfully' };
    } catch (error) {
        if (error instanceof AppError) {
            throw error;
        }

        throw new AppError('Auth service failed', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
};

// Resend OTP
const resendOtp = async (email) => {
    try {
        const otpTraceId = createOtpTraceId('resend', email);
        console.log('[OTP TRACE] Resend flow started:', { otpTraceId, email });
        const user = await User.findOne({ email });

        if (!user) {
            throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
        }

        // Cooldown check (1 minute)
        if (user.lastOtpSentAt && Date.now() - user.lastOtpSentAt < 60000) {
            throw new AppError('Please wait before resending OTP', HTTP_STATUS.BAD_REQUEST);
        }

        // Generate new OTP
        const otp = generateOTP();
        user.otp = otp;
        user.otpExpires = Date.now() + 10 * 60 * 1000;
        user.lastOtpSentAt = Date.now();
        console.log('[OTP TRACE] Resend OTP generated:', {
            otpTraceId,
            email,
            otpLength: otp.length,
            otpExpiresAt: new Date(user.otpExpires).toISOString(),
            lastOtpSentAt: new Date(user.lastOtpSentAt).toISOString()
        });
        await user.save();
        console.log('[OTP TRACE] Resend OTP persisted:', {
            otpTraceId,
            userId: user._id,
            email,
            hasOtp: !!user.otp
        });

        // Send New OTP via Email
        if (process.env.NODE_ENV === 'development') {
            console.log(`[OTP] Request started for email: ${email}`);
            console.log(`[OTP] Generated OTP: ${otp}`);
            const debugMsg = `[DEV-OTP] Resent OTP for ${email}: ${otp} | NODE_ENV: ${process.env.NODE_ENV}\n`;
            try {
                fs.appendFileSync('debug_output.txt', debugMsg);
            } catch (e) {
                console.error('Failed to write debug file', e);
            }
            console.log(debugMsg);
        }

        const emailResult = await emailService.sendEmail(
            email,
            'SoundWave Verification Code (Resend)',
            `Your new verification code is ${otp}. It expires in 10 minutes.`,
            otp,
            { otpTraceId, flow: 'resend' }
        );
        console.log('[OTP TRACE] Email service returned to resend flow:', {
            otpTraceId,
            email,
            sendSucceeded: !!emailResult,
            messageId: emailResult?.messageId || null,
            response: emailResult?.response || null
        });
        if (!emailResult && process.env.DEV_OTP_CONSOLE === 'true') {
            console.log(`\n[DEV OTP FALLBACK] OTP for ${email} is: ${otp}\n`);
        }

        return {
            message: 'OTP resent'
        };
    } catch (error) {
        if (error instanceof AppError) {
            throw error;
        }

        throw new AppError('Auth service failed', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
};

// Login user
const loginUser = async (email, password) => {
    try {
        // Check for Admin (by email)
        if (email === process.env.ADMIN_EMAIL) {
            // First check if admin has a DB record with updated password
            let dbAdmin = await User.findOne({ email: email, role: 'admin' });
            console.log("LOGIN TRACE → dbAdmin found:", dbAdmin?.email);

            let passwordValid = false;

            if (dbAdmin && dbAdmin.password) {
                // Check DB password first (supports password changes)
                passwordValid = await bcrypt.compare(password, dbAdmin.password);
                console.log("LOGIN TRACE → dbAdmin found:", dbAdmin?.email);
            }



            if (passwordValid) {
                // Ensure admin session always uses a real MongoDB ObjectId
                if (!dbAdmin) {
                    const salt = await bcrypt.genSalt(10);
                    const hashedPassword = await bcrypt.hash(password, salt);
                    dbAdmin = await User.create({
                        name: process.env.ADMIN_NAME || 'Admin',
                        email: email,
                        password: hashedPassword,
                        role: 'admin',
                        isVerified: true
                    });
                }

                // Token generation removed
                return {
                    user: {
                        id: dbAdmin._id,
                        name: dbAdmin.name,
                        email: email,
                        role: 'admin'
                    },
                };
            }
        }

        // Check for user
        const user = await User.findOne({ email, isDeleted: { $ne: true } });
        if (!user) {
            throw new AppError('Invalid email or password', HTTP_STATUS.UNAUTHORIZED);
        }

        // Check password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            throw new AppError('Invalid credentials', HTTP_STATUS.UNAUTHORIZED);
        }

        if (user.isBlocked) {
            throw new AppError('User account is blocked', HTTP_STATUS.FORBIDDEN);
        }

        if (!user.isVerified) {
            throw new AppError('Please verify your email first', HTTP_STATUS.UNAUTHORIZED);
        }

        // Token generation removed
        return {
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role // Critical for Admin Check
            },
        };
    } catch (error) {
        if (error instanceof AppError) {
            throw error;
        }

        throw new AppError('Auth service failed', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
};

// Forgot Password
const forgotPassword = async (email) => {
    try {
        const otpTraceId = createOtpTraceId('forgot-password', email);
        console.log('[OTP TRACE] Forgot-password OTP flow started:', { otpTraceId, email });
        const user = await User.findOne({ email });
        if (!user) {
            throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
        }

        const otp = generateOTP();
        user.resetOtp = otp;
        user.resetOtpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
        console.log('[OTP TRACE] Forgot-password OTP generated:', {
            otpTraceId,
            email,
            otpLength: otp.length,
            otpExpiresAt: new Date(user.resetOtpExpires).toISOString()
        });
        await user.save();
        console.log('[OTP TRACE] Forgot-password OTP persisted:', {
            otpTraceId,
            userId: user._id,
            email,
            hasResetOtp: !!user.resetOtp
        });

        // Send Reset OTP via Email
        if (process.env.NODE_ENV === 'development') {
            console.log(`[OTP] Request started for email: ${email}`);
            console.log(`[OTP] Generated OTP: ${otp}`);
        }
        const emailResult = await emailService.sendEmail(
            email,
            'Password Reset OTP for SoundWave',
            `Your Password Reset OTP is ${otp}. It expires in 10 minutes.`,
            otp,
            { otpTraceId, flow: 'forgot-password' }
        );
        console.log('[OTP TRACE] Email service returned to forgot-password flow:', {
            otpTraceId,
            email,
            sendSucceeded: !!emailResult,
            messageId: emailResult?.messageId || null,
            response: emailResult?.response || null
        });
        if (!emailResult && process.env.DEV_OTP_CONSOLE === 'true') {
            console.log(`\n[DEV OTP FALLBACK] OTP for ${email} is: ${otp}\n`);
        }

        return {
            message: 'OTP sent to email'
        };
    } catch (error) {
        if (error instanceof AppError) {
            throw error;
        }

        throw new AppError('Auth service failed', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
};

// Reset Password
const resetPassword = async (email, newPassword) => {
    try {
        const user = await User.findOne({ email });
        if (!user) {
            throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);

        if (user.googleId && !user.isVerified) {
            user.isVerified = true;
        }

        // Clear reset fields
        user.resetOtp = undefined;
        user.resetOtpExpires = undefined;
        await user.save();

        return { message: 'Password reset successfully' };
    } catch (error) {
        if (error instanceof AppError) {
            throw error;
        }

        throw new AppError('Auth service failed', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
};

module.exports = {
    registerUser,
    loginUser,
    verifyOtp,
    verifyResetOtp,
    resendOtp,
    forgotPassword,
    resetPassword,
};
