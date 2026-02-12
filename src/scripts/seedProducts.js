// Seed script to populate sample products
require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Brand = require('../models/Brand');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/soundwave';

const sampleProducts = [
    { title: 'Wireless Over-Ear Headphones', sku: 'WH-1000XM5', connectionType: 'Wireless', category: 'Over-ear', price: 349.99, originalPrice: 399.99, discountPercentage: 12, stockCount: 150, reservedCount: 20, status: 'Active', badges: ['Best seller'] },
    { title: 'Noise-Canceling Earbuds', sku: 'NC-EB200', connectionType: 'Wireless', category: 'In-ear', price: 149.99, originalPrice: 179.99, discountPercentage: 17, stockCount: 80, reservedCount: 10, status: 'Active', badges: ['New'] },
    { title: 'Studio Monitor Headphones', sku: 'SM-PRO50', connectionType: 'Wired', category: 'Over-ear', price: 249.99, originalPrice: null, discountPercentage: 0, stockCount: 50, reservedCount: 5, status: 'Active', badges: [] },
    { title: 'Sport Wireless Earbuds', sku: 'SP-WE100', connectionType: 'Wireless', category: 'In-ear', price: 99.99, originalPrice: 129.99, discountPercentage: 23, stockCount: 200, reservedCount: 30, status: 'Active', badges: ['Deal'] },
    { title: 'Bluetooth On-Ear Headphones', sku: 'BT-OE300', connectionType: 'Wireless', category: 'On-ear', price: 129.99, originalPrice: null, discountPercentage: 0, stockCount: 120, reservedCount: 15, status: 'Active', badges: [] },
    { title: 'True Wireless Earbuds Pro', sku: 'TW-PRO500', connectionType: 'Wireless', category: 'In-ear', price: 199.99, originalPrice: 249.99, discountPercentage: 20, stockCount: 180, reservedCount: 25, status: 'Active', badges: ['Best seller', 'New'] },
    { title: 'Professional DJ Headphones', sku: 'DJ-HDJ2000', connectionType: 'Wired', category: 'Over-ear', price: 299.99, originalPrice: null, discountPercentage: 0, stockCount: 35, reservedCount: 3, status: 'Active', badges: [] },
    { title: 'Kids On-Ear Headphones', sku: 'KD-OE100', connectionType: 'Wired', category: 'On-ear', price: 29.99, originalPrice: 39.99, discountPercentage: 25, stockCount: 300, reservedCount: 0, status: 'Active', badges: ['Deal'] },
    { title: 'Gaming Headset Pro', sku: 'GM-HSP700', connectionType: 'Wired', category: 'Over-ear', price: 179.99, originalPrice: 199.99, discountPercentage: 10, stockCount: 90, reservedCount: 12, status: 'Active', badges: ['New'] },
    { title: 'Compact Wireless Earphones', sku: 'CW-EP400', connectionType: 'Wireless', category: 'In-ear', price: 79.99, originalPrice: null, discountPercentage: 0, stockCount: 250, reservedCount: 40, status: 'Active', badges: [] },
    { title: 'Hi-Fi Audiophile Headphones', sku: 'HF-AH900', connectionType: 'Wired', category: 'Over-ear', price: 499.99, originalPrice: 599.99, discountPercentage: 17, stockCount: 20, reservedCount: 2, status: 'Active', badges: ['Best seller'] },
    { title: 'Foldable On-Ear Wireless', sku: 'FD-OEW200', connectionType: 'Wireless', category: 'On-ear', price: 89.99, originalPrice: 109.99, discountPercentage: 18, stockCount: 160, reservedCount: 8, status: 'Active', badges: [] },
    { title: 'Wired In-Ear Monitors', sku: 'WD-IEM350', connectionType: 'Wired', category: 'In-ear', price: 59.99, originalPrice: null, discountPercentage: 0, stockCount: 400, reservedCount: 50, status: 'Active', badges: ['Deal'] },
    { title: 'Bass Boost Wireless Earbuds', sku: 'BB-WEB600', connectionType: 'Wireless', category: 'In-ear', price: 119.99, originalPrice: 149.99, discountPercentage: 20, stockCount: 110, reservedCount: 18, status: 'Inactive', badges: [] },
    { title: 'Travel Noise-Canceling Headphones', sku: 'TV-NCH800', connectionType: 'Wireless', category: 'Over-ear', price: 279.99, originalPrice: 329.99, discountPercentage: 15, stockCount: 65, reservedCount: 7, status: 'Active', badges: ['New'] },
];

async function seed() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('MongoDB connected');

        // Get a brand to assign to products (use first active brand)
        const brands = await Brand.find({ isDeleted: { $ne: true } }).limit(5);
        if (brands.length === 0) {
            console.log('No brands found. Please run seedBrands.js first.');
            process.exit(1);
        }

        // Clear existing products
        await Product.deleteMany({});
        console.log('Cleared existing products');

        // Assign brands round-robin
        const productsWithBrands = sampleProducts.map((p, i) => ({
            ...p,
            brand: brands[i % brands.length]._id,
            images: [],
            isListed: true
        }));

        await Product.insertMany(productsWithBrands);
        console.log(`Seeded ${productsWithBrands.length} products`);

        await mongoose.disconnect();
        console.log('Done');
        process.exit(0);
    } catch (err) {
        console.error('Seed error:', err);
        process.exit(1);
    }
}

seed();
