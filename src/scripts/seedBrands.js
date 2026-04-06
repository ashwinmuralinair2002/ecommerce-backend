// Script to populate database with sample brands
const mongoose = require('mongoose');
require('../config/load-env');
const Brand = require('../models/brand.model');

const seedBrands = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected');

        // Clear existing brands to ensure new schema
        await Brand.deleteMany({});
        console.log('Cleared existing brands');

        const brands = [
            {
                name: 'Sony',
                description: 'Electronics Giant',
                logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Sony_logo.svg/320px-Sony_logo.svg.png',
                isActive: true,
                productCount: 15,
                website: 'https://www.sony.com',
                contactEmail: 'contact@sony.com'
            },
            {
                name: 'Apple',
                description: 'Innovative Technology',
                logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/f/fa/Apple_logo_black.svg',
                isActive: true,
                productCount: 42,
                website: 'https://www.apple.com',
                contactEmail: 'support@apple.com'
            },
            {
                name: 'Samsung',
                description: 'Global Leader in Tech',
                logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/2/24/Samsung_Logo.svg',
                isActive: false,
                productCount: 0,
                website: 'https://www.samsung.com',
                contactEmail: 'info@samsung.com'
            },
            {
                name: 'Nike',
                description: 'Just Do It',
                logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/a6/Logo_NIKE.svg',
                isActive: true,
                productCount: 100,
                website: 'https://www.nike.com',
                contactEmail: 'help@nike.com'
            },
            {
                name: 'Adidas',
                description: 'Impossible is Nothing',
                isActive: true,
                productCount: 0,
                website: 'https://www.adidas.com',
                contactEmail: 'contact@adidas.com'
            }
        ];

        await Brand.insertMany(brands);
        console.log('Brands Seeded Successfully');
        process.exit();
    } catch (error) {
        console.error('Error seeding brands:', error);
        process.exit(1);
    }
};

seedBrands();
