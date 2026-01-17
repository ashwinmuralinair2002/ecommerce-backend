const mongoose = require('mongoose');
const User = require('./src/models/user.model');
const dotenv = require('dotenv');

dotenv.config();

const checkAdmin = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/project');
        console.log('MongoDB Connected');

        const admin = await User.findOne({ role: 'admin' });
        if (admin) {
            console.log('Admin found:', admin.email);
            console.log('Role:', admin.role);
            console.log('Is Blocked:', admin.isBlocked);
        } else {
            console.log('No admin user found.');
        }

        mongoose.connection.close();
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

checkAdmin();
