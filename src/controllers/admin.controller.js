const adminService = require('../services/admin.service');

// @desc    Get All Users
// @route   GET /api/admin/users
const getUsers = async (req, res) => {
    try {
        const result = await adminService.getAllUsers(req.query);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// @desc    Block/Unblock User
// @route   PATCH /api/admin/users/:id/block
const blockUser = async (req, res) => {
    try {
        const result = await adminService.toggleBlockUser(req.params.id);
        res.json(result);
    } catch (error) {
        res.status(404).json({ error: error.message });
    }
};

module.exports = {
    getUsers,
    blockUser
};
