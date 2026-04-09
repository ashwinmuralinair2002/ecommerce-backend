// User profile controller for account management
const profileService = require('../services/profile.service');
const User = require('../models/user.model');
const bcrypt = require('bcryptjs');
const HTTP_STATUS = require('../constants/http-status');
const MESSAGES = require('../constants/messages');

// @desc    Get User Profile
// @route   GET /api/profile
const getProfile = async (req, res) => {
    try {
        const user = await profileService.getProfile(req.user.id);
        res.json(user);
    } catch (error) {
        res.status(HTTP_STATUS.NOT_FOUND).json({ error: error.message });
    }
};

// @desc    Update User Profile
// @route   PUT /api/profile
const updateProfile = async (req, res) => {
    try {
        const user = await profileService.updateProfile(req.user.id, req.body);
        res.json(user);
    } catch (error) {
        res.status(HTTP_STATUS.BAD_REQUEST).json({ error: error.message });
    }
};

// @desc    Upload Profile Photo
// @route   POST /api/profile/upload-photo
const uploadProfilePhoto = async (req, res) => {
    if (!req.file) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
            message: MESSAGES.PROFILE_IMAGE_MISSING,
            error: MESSAGES.PROFILE_IMAGE_MISSING
        });
    }

    try {
        // req.file.path contains the Cloudinary URL
        const imageUrl = req.file.path;

        // Update user record directly here or via service
        // Since it's a simple field update, we can use service.updateProfile logic if it supports arbitrary fields,
        // OR creates a specific service method.
        // Let's create a specific one or reuse updates.
        // Reusing updateProfile might be cleaner if we pass { profileImage: imageUrl }

        const user = await profileService.updateProfile(req.user.id, { profileImage: imageUrl });

        res.json({ message: 'Profile photo uploaded', profileImage: imageUrl, user });
    } catch (error) {
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            message: error.message,
            error: error.message
        });
    }
};

// @desc    Request Email Change
// @route   POST /api/profile/email/request
const requestEmailChange = async (req, res) => {
    const { newEmail } = req.body;
    if (!newEmail) return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'New email is required' });

    try {
        const result = await profileService.requestEmailChange(req.user.id, newEmail);
        req.session.otpEmail = newEmail;
        req.session.save(() => {
            res.json(result);
        });
    } catch (error) {
        res.status(HTTP_STATUS.BAD_REQUEST).json({ error: error.message });
    }
};

// @desc    Verify Email Change
// @route   POST /api/profile/email/verify
const verifyEmailChange = async (req, res) => {
    const { otp } = req.body;
    if (!otp) return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: MESSAGES.OTP_REQUIRED });

    try {
        const result = await profileService.verifyEmailChange(req.user.id, otp);
        const user = await User.findById(req.user.id).select('role');
        if (req.session.otpEmail) {
            req.session.otpEmail = null;
        }
        res.json({
            ...result,
            role: user ? user.role : undefined
        });
    } catch (error) {
        res.status(HTTP_STATUS.BAD_REQUEST).json({ error: error.message });
    }
};

// @desc    Add Address
// @route   POST /api/profile/address
const addAddress = async (req, res) => {
    const { street, city, state, zip, country } = req.body;
    if (!street || !city || !state || !zip || !country) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'All address fields are required' });
    }

    try {
        const addresses = await profileService.addAddress(req.user.id, req.body);
        res.json(addresses);
    } catch (error) {
        res.status(HTTP_STATUS.BAD_REQUEST).json({ error: error.message });
    }
};

// @desc    Update Address
// @route   PUT /api/profile/address/:id
const updateAddress = async (req, res) => {
    try {
        const addresses = await profileService.updateAddress(req.user.id, req.params.id, req.body);
        res.json(addresses);
    } catch (error) {
        res.status(HTTP_STATUS.BAD_REQUEST).json({ error: error.message });
    }
};

// @desc    Delete Address
// @route   DELETE /api/profile/address/:id
const deleteAddress = async (req, res) => {
    try {
        const addresses = await profileService.deleteAddress(req.user.id, req.params.id);
        res.json(addresses);
    } catch (error) {
        res.status(HTTP_STATUS.BAD_REQUEST).json({ error: error.message });
    }
};

// @desc    Delete Account
// @route   DELETE /api/profile/delete
const deleteAccount = async (req, res) => {
    try {
        await profileService.deleteUser(req.user.id);

        // Logout user after deletion
        res.clearCookie('token');
        req.logout((err) => {
            if (err) {
                console.error('Logout Error during deletion:', err);
                // Even if logout fails, response with success as user is deleted
                return res.json({ message: 'Account deleted' });
            }
            req.session.destroy((err) => {
                if (err) console.error('Session Destroy Error:', err);
                res.json({ message: 'Account deleted successfully' });
            });
        });
    } catch (error) {
        res.status(HTTP_STATUS.BAD_REQUEST).json({ error: error.message });
    }
};

// @desc    Request Password Change
// @route   POST /api/profile/password/request
const requestPasswordChange = async (req, res) => {
    const { oldPassword, newPassword, confirmPassword } = req.body;

    if (!oldPassword || !newPassword || !confirmPassword) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'All fields are required' });
    }
    if (newPassword !== confirmPassword) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'New passwords do not match' });
    }
    if (newPassword.length < 6) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'New password must be at least 6 characters' });
    }

    try {
        // Service validates old password and returns success if valid
        const result = await profileService.requestPasswordChange(req.user.id, oldPassword, newPassword);

        // Store HASHED new password in session temporarily
        // We hash it here so it's not plaintext in session store
        const salt = await bcrypt.genSalt(10);
        const tempPasswordHash = await bcrypt.hash(newPassword, salt);

        req.session.tempPasswordHash = tempPasswordHash;
        req.session.otpEmail = req.user.email; // Ensure email is in session for OTP page

        req.session.save(() => {
            res.json(result);
        });
    } catch (error) {
        res.status(HTTP_STATUS.BAD_REQUEST).json({ error: error.message });
    }
};

// @desc    Verify Password Change
// @route   POST /api/profile/password/verify
const verifyPasswordChange = async (req, res) => {
    const { otp } = req.body;
    const tempPasswordHash = req.session.tempPasswordHash;

    if (!otp) return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: MESSAGES.OTP_REQUIRED });
    if (!tempPasswordHash) return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Session expired. Please request password change again.' });

    try {
        const result = await profileService.verifyPasswordChange(req.user.id, otp, tempPasswordHash);

        // Clear session data
        req.session.tempPasswordHash = null;
        if (req.session.otpEmail) req.session.otpEmail = null;

        res.json(result);
    } catch (error) {
        res.status(HTTP_STATUS.BAD_REQUEST).json({ error: error.message });
    }
};

// @desc    Resend Password Change OTP
// @route   POST /api/profile/password/resend
const resendPasswordChangeOtp = async (req, res) => {
    // Check if user is in valid password change flow (session has temp hash)
    if (!req.session.tempPasswordHash) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Session expired. Please request password change again.' });
    }

    try {
        const result = await profileService.resendPasswordChangeOtp(req.user.id);
        req.session.otpEmail = req.user.email; // Ensure email is in session
        req.session.save(() => {
            res.json(result);
        });
    } catch (error) {
        res.status(HTTP_STATUS.BAD_REQUEST).json({ error: error.message });
    }
};

module.exports = {
    getProfile,
    updateProfile,
    requestEmailChange,
    verifyEmailChange,
    addAddress,
    updateAddress,
    deleteAddress,
    deleteAccount,
    requestPasswordChange,
    verifyPasswordChange,
    resendPasswordChangeOtp,
    uploadProfilePhoto
};
