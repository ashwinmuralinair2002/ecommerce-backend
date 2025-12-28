const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const emailService = require('./email.service');

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
    await emailService.sendEmail(email, 'Your OTP for SoundWave', `Your OTP is ${otp}. It expires in 10 minutes.`);

    return {
        id: user._id,
        name: user.name,
        email: user.email,
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

    return { message: 'Account verified successfully' };
};

// Resend OTP
const resendOtp = async (email) => {
    const user = await User.findOne({ email });

    if (!user) {
        throw new Error('User not found');
    }

    if (user.isVerified) {
        throw new Error('User already verified');
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
    await emailService.sendEmail(email, 'Your New OTP for SoundWave', `Your new OTP is ${otp}. It expires in 10 minutes.`);

    return { message: 'OTP resent' }; // Removed OTP from response
};

// Login user
const loginUser = async (email, password) => {
    // Check for user
    const user = await User.findOne({ email });
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

    // Generate Token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret', {
        expiresIn: '1h',
    });

    return {
        token,
        user: {
            id: user._id,
            name: user.name,
            email: user.email,
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
    await emailService.sendEmail(email, 'Password Reset OTP for SoundWave', `Your Password Reset OTP is ${otp}. It expires in 10 minutes.`);

    return { message: 'OTP sent to email' }; // Removed OTP from response
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
