const express = require('express');
const { verifyToken, isAdmin } = require('../middleware/auth.middleware');
const { getUsers, blockUser } = require('../controllers/admin.controller');

const router = express.Router();

router.use(verifyToken);
router.use(isAdmin);

// @desc    Get all users (Admin only)
// @route   GET /api/admin/users
router.get('/users', getUsers);

// @desc    Block/Unblock User
// @route   PATCH /api/admin/users/:id/block
router.patch('/users/:id/block', blockUser);

module.exports = router;
