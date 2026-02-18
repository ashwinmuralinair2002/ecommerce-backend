const mongoose = require('mongoose');
const Product = require('../models/Product');
const Category = require('../models/Category');
require('dotenv').config();

const DB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/soundwave';

const migrateCategories = async () => {
    try {
        await mongoose.connect(DB_URI);
        console.log('Connected to MongoDB');

        // 1. Ensure Categories Exist
        const categoryNames = ['In-ear', 'On-ear', 'Over-ear'];
        const categoryMap = {};

        for (const name of categoryNames) {
            let category = await Category.findOne({ name });
            if (!category) {
                console.log(`Creating category: ${name}`);
                category = await Category.create({ name, isListed: true });
            }
            categoryMap[name] = category._id;
            console.log(`Mapped '${name}' to ID: ${category._id}`);
        }

        // 2. Find Products with String Categories
        // We have to use a raw query because the schema might still define category as String,
        // or if we updated schema, mongoose might cast error.
        // For safety, we iterate all and check.
        const products = await Product.find({});
        let updatedCount = 0;

        for (const product of products) {
            // Check if category is a string and exists in our map
            // Note: If schema is already changed to ObjectId, product.category might be cast error or null if invalid
            // So this script should be run BEFORE schema change, or we use lean() and updateOne.
            // valid formats: "In-ear", "On-ear", "Over-ear"

            const currentCat = product.get('category'); // use get to bypass strict check if possible or raw

            if (typeof currentCat === 'string' && categoryMap[currentCat]) {
                const newCatId = categoryMap[currentCat];

                // Update directly using updateOne to bypass schema validation for now
                await Product.updateOne(
                    { _id: product._id },
                    { $set: { category: newCatId } }
                );

                console.log(`Updated Product: ${product.title} (${currentCat} -> ${newCatId})`);
                updatedCount++;
            } else if (currentCat && mongoose.Types.ObjectId.isValid(currentCat)) {
                // Already an ID, skip
            } else {
                console.log(`Skipping Product: ${product.title} (Category: ${currentCat})`);
            }
        }

        console.log(`Migration Complete. Updated ${updatedCount} products.`);
        process.exit(0);

    } catch (error) {
        console.error('Migration Failed:', error);
        process.exit(1);
    }
};

migrateCategories();
