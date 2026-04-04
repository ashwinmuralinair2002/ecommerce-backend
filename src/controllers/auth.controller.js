// Authentication controller handling signup, login, and OTP
const { validationResult } = require('express-validator');
const passport = require('passport');
const authService = require('../services/auth.service');
const AppError = require('../utils/AppError');
const HTTP_STATUS = require('../constants/http-status');
const MESSAGES = require('../constants/messages');


// @desc    Register a new user
// @route   POST /api/auth/signup
// @access  Public
const signup = async (req, res) => {
    console.log('[SIGNUP TRACE] signup controller hit:', {
        email: req.body?.email,
        hasName: !!req.body?.name,
        hasPassword: !!req.body?.password,
        hasReferralCode: !!req.body?.referralCode
    });
    // Check Validation
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        // Return the first error message for simplicity as per specs
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: errors.array()[0].msg });
    }

    try {
        const user = await authService.registerUser(req.body);
        console.log('[SIGNUP TRACE] registerUser returned successfully:', {
            userId: user?.id,
            email: user?.email
        });
        req.session.otpEmail = req.body.email;
        req.session.save(() => {
            res.status(HTTP_STATUS.CREATED).json({
                message: 'User registered successfully',
                user,
            });
        });
    } catch (error) {
        console.error('[SIGNUP TRACE] signup controller error:', {
            name: error?.name,
            message: error?.message,
            code: error?.code,
            stack: error?.stack
        });
        res.status(HTTP_STATUS.BAD_REQUEST).json({ error: error.message });
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
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Email and password are required' });
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

                return res.status(HTTP_STATUS.OK).json({
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
        res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: error.message });
    }
};

// @desc    Verify OTP
// @route   POST /api/auth/verify-otp
const verifyOtp = async (req, res) => {
    const { email, otp, mode } = req.body;
    if (!email || !otp) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Email and OTP are required' });
    }

    try {
        if (mode === 'reset') {
            const result = await authService.verifyResetOtp(email, otp);
            req.session.otpEmail = null;
            req.session.resetVerified = true;
            req.session.resetEmail = email;

            return req.session.save((err) => {
                if (err) {
                    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Session save error' });
                }

                res.status(HTTP_STATUS.OK).json(result);
            });
        }

        const result = await authService.verifyOtp(email, otp);
        if (req.session.otpEmail) {
            req.session.otpEmail = null;
        }

        // Auto-Login Logic
        if (result.user) {
            req.session.regenerate((err) => {
                if (err) return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Session error' });

                // Standardize Session Variables
                req.session.userId = result.user.id.toString();
                req.session.role = result.user.role;

                req.session.save((err) => {
                    if (err) return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Session save error' });

                    res.status(HTTP_STATUS.OK).json({
                        ...result,
                        redirect: result.user.role === 'admin' ? '/admin/dashboard' : '/'
                    });
                });
            });
        } else {
            res.status(HTTP_STATUS.OK).json(result);
        }
    } catch (error) {
        res.status(HTTP_STATUS.BAD_REQUEST).json({ error: error.message });
    }
}

// @desc    Resend OTP
// @route   POST /api/auth/resend-otp
const resendOtp = async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Email is required' });
    }

    try {
        const result = await authService.resendOtp(email);
        if (result.error) {
            return res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json(result);
        }
        req.session.otpEmail = email;
        req.session.save(() => {
            res.status(HTTP_STATUS.OK).json(result);
        });
    } catch (error) {
        if (error.message.includes('wait')) {
            return res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({ error: error.message });
        }
        res.status(HTTP_STATUS.BAD_REQUEST).json({ error: error.message });
    }
}

// @desc    Forgot Password
// @route   POST /api/auth/forgot-password
const forgotPassword = async (req, res) => {
    // Check Validation
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: errors.array()[0].msg });
    }

    const { email } = req.body;
    if (!email) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Email is required' });
    }

    try {
        const result = await authService.forgotPassword(email);
        req.session.otpEmail = email;
        req.session.resetVerified = false;
        req.session.resetEmail = null;
        req.session.save(() => {
            res.status(HTTP_STATUS.OK).json(result);
        });
    } catch (error) {
        res.status(HTTP_STATUS.NOT_FOUND).json({ error: error.message });
    }
}

// @desc    Reset Password
// @route   POST /api/auth/reset-password
const resetPassword = async (req, res) => {
    const { email, newPassword } = req.body;
    if (!email || !newPassword) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Email and new password are required' });
    }

    if (newPassword.length < 6) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Password must be at least 6 characters' });
    }

    try {
        if (!req.session.resetVerified || req.session.resetEmail !== email) {
            throw new AppError(MESSAGES.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED);
        }

        const result = await authService.resetPassword(email, newPassword);
        req.session.resetVerified = false;
        req.session.resetEmail = null;

        req.session.save((err) => {
            if (err) {
                return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Session save error' });
            }

            res.status(HTTP_STATUS.OK).json(result);
        });
    } catch (error) {
        const statusCode = error.statusCode || HTTP_STATUS.BAD_REQUEST;
        res.status(statusCode).json({ error: error.message });
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

const handleGoogleAuthCallback = (req, res, next) => {
    passport.authenticate('google', { session: false }, (err, user) => {
        if (err) {
            if (
                (err instanceof AppError && err.statusCode === 403)
                || err.message === 'User account is blocked'
            ) {
                return res.redirect('/login?error=account_unavailable');
            }

            return next(err);
        }

        if (!user) {
            return res.redirect('/login');
        }

        req.user = user;

        // Successful authentication, data is in req.user (from passport strategy)
        req.session.regenerate((sessionError) => {
            if (sessionError) {
                console.error('Google Auth Session Error:', sessionError);
                return res.redirect('/login');
            }

            // Standardize Session
            req.session.userId = req.user._id.toString();
            req.session.role = req.user.role;

            req.session.save((saveError) => {
                if (saveError) {
                    console.error('Google Auth Session Save Error:', saveError);
                    return res.redirect('/login');
                }
                return res.redirect(req.user.role === 'admin' ? '/admin/dashboard' : '/');
            });
        });
    })(req, res, next);
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
