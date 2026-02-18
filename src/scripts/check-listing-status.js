const mongoose = require('mongoose');
const Product = require('../models/Product');
const Category = require('../models/Category');
require('dotenv').config();

const checkStatus = async () => {
    try {
        const connString = process.env.MONGO_URI || process.env.MONGODB_URI;
        await mongoose.connect(connString);

        const categoryName = "In-Ear";
        const categoryDoc = await Category.findOne({ name: categoryName });

        if (!categoryDoc) {
            console.log("Category not found");
            process.exit();
        }

        const products = await Product.find({ category: categoryDoc._id }).select('title isListed category');
        console.log('--- PRODUCT STATUS ---');
        console.log(JSON.stringify(products, null, 2));

        process.exit();
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
};

checkStatus();
