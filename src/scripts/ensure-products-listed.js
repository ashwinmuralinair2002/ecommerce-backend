const mongoose = require('mongoose');
const Product = require('../models/Product');
require('dotenv').config();

const ensureListed = async () => {
    try {
        const connString = process.env.MONGO_URI || process.env.MONGODB_URI;
        await mongoose.connect(connString);

        console.log('--- ENSURING PRODUCTS ARE LISTED ---');

        const result = await Product.updateMany(
            {},
            { $set: { isListed: true, isDeleted: false } }
        );

        console.log(`Updated ${result.modifiedCount} products to be Listed and Not Deleted.`);

        process.exit();

    } catch (error) {
        console.error(error);
        process.exit(1);
    }
};

ensureListed();
