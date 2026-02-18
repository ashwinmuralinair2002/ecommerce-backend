const mongoose = require('mongoose');
const Product = require('../models/Product');
const Category = require('../models/Category');
require('dotenv').config();

const testFilter = async () => {
    try {
        const connString = process.env.MONGO_URI || process.env.MONGODB_URI;
        if (!connString) throw new Error("No MONGO_URI found");
        await mongoose.connect(connString, { serverSelectionTimeoutMS: 5000 });

        console.log('--- TEST FILTER LOGIC ---');

        // 1. Get Category ID for "In-Ear"
        const categoryName = "In-Ear";
        const categoryDoc = await Category.findOne({ name: categoryName });

        if (!categoryDoc) {
            console.log(`❌ Category "${categoryName}" NOT FOUND`);
            process.exit();
        }
        console.log(`✅ Category "${categoryName}" Found. ID: ${categoryDoc._id}`);

        // 2. Simulate Controller Logic
        const categoryInput = categoryDoc._id.toString(); // What frontend sends
        console.log(`Frontend sends: ${categoryInput}`);

        const filter = {};
        // Logic from controller:
        const categories = [categoryInput];
        const categoryIds = categories
            .filter(id => mongoose.Types.ObjectId.isValid(id))
            .map(id => new mongoose.Types.ObjectId(id));

        if (categoryIds.length > 0) {
            filter.category = { $in: categoryIds };
        }
        filter.isListed = true;

        // Add other active filters from controller default
        // listing logic often checks for isListed: true (if added to schema?)
        // Let's check schema
        // Product schema doesn't seem to have isListed in my previous read? 
        // Admin controller had stock checks. User controller might have different checks.
        // Let's assume just category for now.

        console.log('Constructed Filter:', JSON.stringify(filter));

        // 3. Run Query
        const count = await Product.countDocuments(filter);
        const products = await Product.find(filter).limit(3).select('title category');

        console.log(`Found ${count} products.`);
        console.log('Sample:', products);

        process.exit();

    } catch (error) {
        console.error(error);
        process.exit(1);
    }
};

testFilter();
