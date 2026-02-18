const mongoose = require('mongoose');
const Category = require('../models/Category');
const Product = require('../models/Product');
require('dotenv').config();

const debug = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        console.log('--- CATEGORIES ---');
        const categories = await Category.find({});
        console.log(JSON.stringify(categories, null, 2));

        console.log('--- PRODUCTS SAMPLE ---');
        const products = await Product.find({}).limit(3).populate('category');
        console.log(JSON.stringify(products.map(p => ({
            title: p.title,
            categoryField: p.category,
            categoryType: typeof p.category
        })), null, 2));

        process.exit();
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
};

debug();
