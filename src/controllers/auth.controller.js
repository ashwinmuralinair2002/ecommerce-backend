// Authentication controller handling signup, login, and OTP
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
        req.session.otpEmail = req.body.email;
        req.session.save(() => {
            res.status(201).json({
                message: 'User registered successfully',
                user,
            });
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// @desc    Authenticate user & get session
// @route   POST /api/auth/login
// @access  Public
// @desc    Authenticate user & get session
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res, next) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    try {
        const data = await authService.loginUser(email, password);
        const user = data.user;

        // Regenerate Session for Security
        req.session.regenerate((err) => {
            if (err) return next(err);

            // Standardize Session Variables
            req.session.userId = user.id.toString();
            req.session.role = user.role;

            req.session.save((err) => {
                if (err) return next(err);

                return res.status(200).json({
                    message: 'Login successful',
                    user: {
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        role: user.role
                    },
                    redirect: user.role === 'admin' ? '/admin/dashboard' : '/'
                });
            });
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
        if (req.session.otpEmail) {
            req.session.otpEmail = null;
        }

        // Auto-Login Logic
        if (result.user) {
            req.session.regenerate((err) => {
                if (err) return res.status(500).json({ error: 'Session error' });

                // Standardize Session Variables
                req.session.userId = result.user.id.toString();
                req.session.role = result.user.role;

                req.session.save((err) => {
                    if (err) return res.status(500).json({ error: 'Session save error' });

                    res.status(200).json({
                        ...result,
                        redirect: result.user.role === 'admin' ? '/admin/dashboard' : '/'
                    });
                });
            });
        } else {
            res.status(200).json(result);
        }
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
            return res.status(429).json(result);
        }
        req.session.otpEmail = email;
        req.session.save(() => {
            res.status(200).json(result);
        });
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
    // Check Validation
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
    }

    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    try {
        const result = await authService.forgotPassword(email);
        req.session.otpEmail = email;
        req.session.save(() => {
            res.status(200).json(result);
        });
    } catch (error) {
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

const logout = (req, res) => {
    // 1. Clear Session
    req.session.destroy((err) => {
        if (err) console.error('Session Destroy Error:', err);

        // 2. Clear Cookie
        res.clearCookie('connect.sid');

        // 3. Redirect
        res.redirect('/login');
    });
};

const handleGoogleAuthCallback = (req, res) => {
    // Successful authentication, data is in req.user (from passport strategy)
    req.session.regenerate((err) => {
        if (err) {
            console.error('Google Auth Session Error:', err);
            return res.redirect('/login');
        }

        // Standardize Session
        req.session.userId = req.user._id.toString();
        req.session.role = req.user.role || 'user';

        req.session.save((err) => {
            if (err) {
                console.error('Google Auth Session Save Error:', err);
                return res.redirect('/login');
            }
            res.redirect('/');
        });
    });
};

module.exports = {
    signup,
    login,
    verifyOtp,
    resendOtp,
    forgotPassword,
    resetPassword,
    logout,
    handleGoogleAuthCallback
};
