const mongoose = require('mongoose');
const Category = require('../models/Category');
require('dotenv').config();

const checkCategories = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const categories = await Category.find({});
        console.log('Categories in DB:', categories.map(c => ({ name: c.name, id: c._id })));
        process.exit();
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
};

checkCategories();
