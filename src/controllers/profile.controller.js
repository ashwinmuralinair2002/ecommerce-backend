// User profile controller for account management
const profileService = require('../services/profile.service');

// @desc    Get User Profile
// @route   GET /api/profile
const getProfile = async (req, res) => {
    try {
        const user = await profileService.getProfile(req.user.id);
        res.json(user);
    } catch (error) {
        res.status(404).json({ error: error.message });
    }
};

// @desc    Update User Profile
// @route   PUT /api/profile
const updateProfile = async (req, res) => {
    try {
        const user = await profileService.updateProfile(req.user.id, req.body);
        res.json(user);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// @desc    Request Email Change
// @route   POST /api/profile/email/request
const requestEmailChange = async (req, res) => {
    const { newEmail } = req.body;
    if (!newEmail) return res.status(400).json({ error: 'New email is required' });

    try {
        const result = await profileService.requestEmailChange(req.user.id, newEmail);
        res.json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// @desc    Verify Email Change
// @route   POST /api/profile/email/verify
const verifyEmailChange = async (req, res) => {
    const { otp } = req.body;
    if (!otp) return res.status(400).json({ error: 'OTP is required' });

    try {
        const result = await profileService.verifyEmailChange(req.user.id, otp);
        res.json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// @desc    Add Address
// @route   POST /api/profile/address
const addAddress = async (req, res) => {
    const { street, city, state, zip, country } = req.body;
    if (!street || !city || !state || !zip || !country) {
        return res.status(400).json({ error: 'All address fields are required' });
    }

    try {
        const addresses = await profileService.addAddress(req.user.id, req.body);
        res.json(addresses);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// @desc    Update Address
// @route   PUT /api/profile/address/:id
const updateAddress = async (req, res) => {
    try {
        const addresses = await profileService.updateAddress(req.user.id, req.params.id, req.body);
        res.json(addresses);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// @desc    Delete Address
// @route   DELETE /api/profile/address/:id
const deleteAddress = async (req, res) => {
    try {
        const addresses = await profileService.deleteAddress(req.user.id, req.params.id);
        res.json(addresses);
    } catch (error) {
        res.status(400).json({ error: error.message });
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
        res.status(400).json({ error: error.message });
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
    deleteAccount
};
