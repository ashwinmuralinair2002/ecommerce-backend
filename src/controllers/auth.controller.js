const { validationResult } = require('express-validator');
const authService = require('../services/auth.service');

// @desc    Register a new user
// @route   POST /api/auth/signup
// @access  Public
const signup = async (req, res) => {
    // Check Validation
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        // Return the first error message for simplicity as per specs
        return res.status(400).json({ error: errors.array()[0].msg });
    }

    try {
        const user = await authService.registerUser(req.body);
        res.status(201).json({
            message: 'User registered successfully',
            user,
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// @desc    Authenticate user & get token
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    try {
        const data = await authService.loginUser(email, password);
        res.status(200).json({
            message: 'Login successful',
            ...data,
        });
    } catch (error) {
        res.status(401).json({ error: error.message });
    }
};

// @desc    Verify OTP
// @route   POST /api/auth/verify-otp
const verifyOtp = async (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) {
        return res.status(400).json({ error: 'Email and OTP are required' });
    }

    try {
        const result = await authService.verifyOtp(email, otp);
        res.status(200).json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// @desc    Resend OTP
// @route   POST /api/auth/resend-otp
const resendOtp = async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    try {
        const result = await authService.resendOtp(email);
        if (result.error) {
            return res.status(429).json(result); // Handle cooldown specifically if we returned object
        }
        res.status(200).json(result);
    } catch (error) {
        if (error.message.includes('wait')) {
            return res.status(429).json({ error: error.message });
        }
        res.status(400).json({ error: error.message });
    }
}

// @desc    Forgot Password
// @route   POST /api/auth/forgot-password
const forgotPassword = async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    try {
        const result = await authService.forgotPassword(email);
        res.status(200).json(result);
    } catch (error) {
        // In prod, return 200 even if user not found to prevent enumeration
        // But for this specific task requirement "Invalid email", we return specific error or 404
        res.status(404).json({ error: error.message });
    }
}

// @desc    Reset Password
// @route   POST /api/auth/reset-password
const resetPassword = async (req, res) => {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    try {
        const result = await authService.resetPassword(email, otp, newPassword);
        res.status(200).json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

module.exports = {
    signup,
    login,
    verifyOtp,
    resendOtp,
    forgotPassword,
    resetPassword
};
