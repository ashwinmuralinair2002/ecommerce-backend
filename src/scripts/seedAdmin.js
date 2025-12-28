const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/user.model');
const connectDB = require('../config/db');
require('dotenv').config();

const seedAdmin = async () => {
    try {
        await connectDB();

        const adminEmail = 'admin@example.com';
        const userExists = await User.findOne({ email: adminEmail });

        if (userExists) {
            console.log('Admin already exists');
            process.exit();
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('admin123', salt);

        await User.create({
            name: 'Super Admin',
            email: adminEmail,
            password: hashedPassword,
            role: 'admin',
            isVerified: true
        });

        console.log('Admin user created successfully');
        process.exit();
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

seedAdmin();
