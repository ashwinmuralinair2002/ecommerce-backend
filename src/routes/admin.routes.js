const express = require('express');
const { ensureAdminAuthenticated } = require('../middleware/admin-auth.middleware');
const { getUsers, blockUser } = require('../controllers/admin.controller');

const router = express.Router();

router.use(ensureAdminAuthenticated);

// @desc    Get all users (Admin only)
// @route   GET /api/admin/users
router.get('/users', getUsers);

// @desc    Block/Unblock User
// @route   PATCH /api/admin/users/:id/block
router.patch('/users/:id/block', blockUser);

module.exports = router;
