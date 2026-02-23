// Authentication business logic including OTP and hashing
const bcrypt = require('bcryptjs');
// JWT removed
const User = require('../models/user.model');
const emailService = require('./email.service');
const fs = require('fs');

// Helper to generate 6-digit OTP
const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

// Register a new user
const registerUser = async (userData) => {
    const { name, email, password } = userData;

    // Check if user exists
    const userExists = await User.findOne({ email });
    if (userExists) {
        throw new Error('User already exists');
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Generate OTP
    const otp = generateOTP();
    const otpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Create user
    const user = await User.create({
        name,
        email,
        password: hashedPassword,
        otp,
        otpExpires,
        lastOtpSentAt: Date.now(),
        isVerified: false
    });

    // Send OTP via Email
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

    await emailService.sendEmail(email, 'SoundWave Verification Code', `Your verification code is ${otp}. It expires in 10 minutes.`, otp);

    return {
        id: user._id,
        name: user.name,
        email: user.email
    };
};

// OTP Verification
const verifyOtp = async (email, otp) => {
    const user = await User.findOne({ email });

    if (!user) {
        throw new Error('User not found');
    }

    if (user.isVerified) {
        return { message: 'User already verified' };
    }

    // Not Verified, proceed to verify
    if (user.otp !== otp) {
        throw new Error('Invalid OTP');
    }

    if (user.otpExpires < Date.now()) {
        throw new Error('OTP expired');
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
};

// Resend OTP
const resendOtp = async (email) => {
    const user = await User.findOne({ email });

    if (!user) {
        throw new Error('User not found');
    }

    // Cooldown check (1 minute)
    if (user.lastOtpSentAt && Date.now() - user.lastOtpSentAt < 60000) {
        throw new Error('Please wait before resending OTP');
    }

    // Generate new OTP
    const otp = generateOTP();
    user.otp = otp;
    user.otpExpires = Date.now() + 10 * 60 * 1000;
    user.lastOtpSentAt = Date.now();
    await user.save();

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

    await emailService.sendEmail(email, 'SoundWave Verification Code (Resend)', `Your new verification code is ${otp}. It expires in 10 minutes.`, otp);

    return {
        message: 'OTP resent'
    };
};

// Login user
const loginUser = async (email, password) => {
    // Check for Admin (by email)
    if (email === process.env.ADMIN_EMAIL) {
        // First check if admin has a DB record with updated password
        let dbAdmin = await User.findOne({ email: email, role: 'admin' });

        let passwordValid = false;

        if (dbAdmin && dbAdmin.password) {
            // Check DB password first (supports password changes)
            passwordValid = await bcrypt.compare(password, dbAdmin.password);
        }

        // Fallback to env password if no DB record or DB password doesn't match
        if (!passwordValid && (password === process.env.ADMIN_PASSWORD)) {
            passwordValid = true;
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
        throw new Error('Invalid email or password');
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
        throw new Error('Invalid credentials');
    }

    if (user.isBlocked) {
        throw new Error('User account is blocked');
    }

    if (!user.isVerified) {
        throw new Error('Please verify your email first');
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
};

// Forgot Password
const forgotPassword = async (email) => {
    const user = await User.findOne({ email });
    if (!user) {
        throw new Error('User not found');
    }

    const otp = generateOTP();
    user.resetOtp = otp;
    user.resetOtpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save();

    // Send Reset OTP via Email
    if (process.env.NODE_ENV === 'development') {
        console.log(`[OTP] Request started for email: ${email}`);
        console.log(`[OTP] Generated OTP: ${otp}`);
    }
    await emailService.sendEmail(email, 'Password Reset OTP for SoundWave', `Your Password Reset OTP is ${otp}. It expires in 10 minutes.`, otp);

    return {
        message: 'OTP sent to email'
    };
};

// Reset Password
const resetPassword = async (email, otp, newPassword) => {
    const user = await User.findOne({ email });
    if (!user) {
        throw new Error('User not found');
    }

    if (user.resetOtp !== otp) {
        throw new Error('Invalid or expired OTP');
    }

    if (user.resetOtpExpires < Date.now()) {
        throw new Error('Invalid or expired OTP');
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);

    // Clear reset fields
    user.resetOtp = undefined;
    user.resetOtpExpires = undefined;
    await user.save();

    return { message: 'Password reset successfully' };
};

module.exports = {
    registerUser,
    loginUser,
    verifyOtp,
    resendOtp,
    forgotPassword,
    resetPassword,
};
