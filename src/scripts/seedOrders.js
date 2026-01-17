// Script to generate sample orders for users
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Order = require('../models/order.model');
const User = require('../models/user.model');

dotenv.config();

const seedOrders = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected');

        // Check if orders exist
        const count = await Order.countDocuments();
        if (count > 0) {
            // console.log('Orders already exist. Skipping seed.');
            // process.exit();
            // Force seed logic for demo purposes or smart checking could be better
        }

        // Fetch seeded users to attach orders to
        const users = await User.find({ role: 'user', deleted: false });

        if (users.length === 0) {
            console.log('No users found to seed orders for. Run seedUsers.js first.');
            process.exit(1);
        }

        const orders = [];
        const statuses = ['Delivered', 'In Transit', 'Cancelled', 'Returned'];

        users.forEach(user => {
            // Create 3-5 orders per user
            const numOrders = Math.floor(Math.random() * 3) + 3;

            for (let i = 0; i < numOrders; i++) {
                const status = statuses[Math.floor(Math.random() * statuses.length)];
                orders.push({
                    orderId: `#ORD-${Math.floor(100000 + Math.random() * 900000)}`,
                    user: user._id,
                    items: [
                        { productName: 'Wireless Headphones', quantity: 1, price: 199.99 },
                        { productName: 'USB-C Cable', quantity: 2, price: 15.00 }
                    ],
                    totalAmount: (199.99 + 30.00).toFixed(2),
                    status: status,
                    createdAt: new Date(Date.now() - Math.floor(Math.random() * 10000000000)) // Random past date
                });
            }
        });

        await Order.insertMany(orders);
        console.log('Orders Seeded Successfully');

        // Update User stats (Total Orders / LTV) - Optional but nice for consistency
        for (const user of users) {
            const userOrders = orders.filter(o => o.user.equals(user._id));
            // Since User model doesn't have real fields for these yet in DB (only virtuals/placeholders in controller), 
            // we can't save them physically unless we added them to schema. 
            // We won't update User model here to avoid scope creep, controller handles placeholders.
        }

        process.exit();
    } catch (error) {
        console.error('Error seeding orders:', error);
        process.exit(1);
    }
};

seedOrders();
