// Seed script to populate the 5 fixed product categories
const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const Category = require('../models/Category');

const categories = [
    { name: 'Wired', imageUrl: '/images/categories/wired.jpg' },
    { name: 'Wireless', imageUrl: '/images/categories/wireless.jpg' },
    { name: 'In-Ear', imageUrl: '/images/categories/in-ear.jpg' },
    { name: 'On-Ear', imageUrl: '/images/categories/on-ear.jpg' },
    { name: 'Over-Ear', imageUrl: '/images/categories/over-ear.jpg' }
];

async function seedCategories() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        for (const cat of categories) {
            await Category.findOneAndUpdate(
                { name: cat.name },
                { $setOnInsert: cat },
                { upsert: true, new: true }
            );
            console.log(`✔ Category "${cat.name}" ensured`);
        }

        console.log('\n✅ All categories seeded successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Seed failed:', error.message);
        process.exit(1);
    }
}

seedCategories();
