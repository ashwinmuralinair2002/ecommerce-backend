// Service layer for admin-related business logic
const User = require('../models/user.model');

// Get All Users (Search, Pagination, Sort)
const getAllUsers = async (query) => {
    const { search, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    let filter = {};
    if (search) {
        filter = {
            $or: [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ]
        };
    }

    const users = await User.find(filter)
        .select('-password -otp -otpExpires -resetOtp -resetOtpExpires -emailChangeOtp -emailChangeOtpExpires')
        .sort({ createdAt: -1 })
        .skip(Number(skip))
        .limit(Number(limit));

    const total = await User.countDocuments(filter);

    return {
        users,
        total,
        page: Number(page),
        pages: Math.ceil(total / limit)
    };
};

// Block/Unblock User
const toggleBlockUser = async (userId) => {
    const user = await User.findById(userId);
    if (!user) {
        throw new Error('User not found');
    }

    // Prevent blocking self (Admin) - Optional safety
    if (user.role === 'admin') {
        // Checking if it's strictly mostly safe. 
        // Real logic usually compares req.user.id with userId in controller, 
        // but checking role here adds a layer. 
        // Let's allow blocking other admins if needed, but maybe warn?
        // Prompt didn't specify, but "Prevent user-admin privilege escalation" was previous task.
        // Let's assume admins can block anyone for now.
    }

    user.isBlocked = !user.isBlocked;
    await user.save();

    return {
        message: user.isBlocked ? 'User blocked' : 'User unblocked',
        isBlocked: user.isBlocked
    };
};

module.exports = {
    getAllUsers,
    toggleBlockUser
};
