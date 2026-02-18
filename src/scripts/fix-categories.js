const mongoose = require('mongoose');
const Category = require('../models/Category');
const Product = require('../models/Product');
require('dotenv').config();

const fixCategories = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        // Target: Title Case
        const targetNames = ['In-Ear', 'On-Ear', 'Over-Ear'];

        for (const name of targetNames) {
            // Find the "Correct" one (Title Case)
            let masterCat = await Category.findOne({ name });
            if (!masterCat) {
                console.log(`Creating Master Category: ${name}`);
                masterCat = await Category.create({ name, isListed: true });
            }
            console.log(`Master Category: ${name} (ID: ${masterCat._id})`);

            // Find the "Bad" one (Sentence Case)
            // e.g. "In-ear" vs "In-Ear"
            // Note: If they are same string, no issue. Here we assume specific bad casing exists based on observations.
            // Let's check specifically for "In-ear" if name is "In-Ear"
            const badName = name.charAt(0) + name.slice(1).toLowerCase(); // "In-ear"

            if (badName !== name) {
                const badCat = await Category.findOne({ name: badName });
                if (badCat) {
                    console.log(`Found Bad Category: ${badName} (ID: ${badCat._id})`);

                    // Migrate Products
                    const result = await Product.updateMany(
                        { category: badCat._id },
                        { $set: { category: masterCat._id } }
                    );
                    console.log(`Migrated ${result.modifiedCount} products from ${badName} to ${name}`);

                    // Delete Bad Category
                    await Category.deleteOne({ _id: badCat._id });
                    console.log(`Deleted Bad Category: ${badName}`);
                }
            }
        }

        console.log('Fix Complete');
        process.exit();

    } catch (error) {
        console.error(error);
        process.exit(1);
    }
};

fixCategories();
