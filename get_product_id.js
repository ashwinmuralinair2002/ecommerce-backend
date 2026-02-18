const mongoose = require('mongoose');
const Product = require('./src/models/Product');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/ecommerce', { useNewUrlParser: true, useUnifiedTopology: true })
    .then(async () => {
        const product = await Product.findOne({ isListed: true });
        if (product) {
            console.log('PRODUCT_ID:', product._id.toString());
        } else {
            console.log('No listed products found');
        }
        process.exit();
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
