// Script to seed dummy user accounts
const mongoose = require('mongoose');
require('../config/load-env');
const bcrypt = require('bcryptjs');
const User = require('../models/user.model');

const seedUsers = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected');

        // Check if users exist to avoid duplicates if run multiple times
        const count = await User.countDocuments({ role: 'user' });
        if (count > 0) {
            console.log('Users already exist. Skipping seed.');
            process.exit();
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('password123', salt);

        const users = [
            {
                name: 'John Doe',
                email: 'john@example.com',
                password: hashedPassword,
                phone: '1234567890',
                role: 'user',
                isVerified: true,
            },
            {
                name: 'Jane Smith',
                email: 'jane@example.com',
                password: hashedPassword,
                phone: '0987654321',
                role: 'user',
                isVerified: true,
                isBlocked: true,
            },
            {
                name: 'Alice Johnson',
                email: 'alice@example.com',
                password: hashedPassword,
                role: 'user',
                isVerified: true,
            },
            {
                name: 'Bob Brown',
                email: 'bob@example.com',
                password: hashedPassword,
                role: 'user',
                isVerified: false,
            }
        ];

        await User.insertMany(users);
        console.log('Users Seeded Successfully');
        process.exit();
    } catch (error) {
        console.error('Error seeding users:', error);
        process.exit(1);
    }
};

seedUsers();
