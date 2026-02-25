require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');

const NOISE_MAP = {
    Active: 'Active Noise Cancellation',
    Passive: 'Passive Noise Isolation',
    None: 'None'
};

async function run() {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) throw new Error('Missing MONGODB_URI/MONGO_URI');

    await mongoose.connect(uri);

    const products = await Product.find({}).select('_id noiseCancellation noiseControlTypes').lean();
    let migratedCount = 0;

    for (const product of products) {
        const legacyValue = typeof product.noiseCancellation === 'string'
            ? product.noiseCancellation.trim()
            : '';
        const mappedValue = NOISE_MAP[legacyValue];
        const currentTypes = Array.isArray(product.noiseControlTypes) ? product.noiseControlTypes : [];

        if (mappedValue && currentTypes.length === 0) {
            await Product.updateOne(
                { _id: product._id },
                { $set: { noiseControlTypes: [mappedValue] } }
            );
            migratedCount += 1;
        }
    }

    console.log(`Total products scanned: ${products.length}`);
    console.log(`Total products migrated: ${migratedCount}`);

    await mongoose.disconnect();
}

run().catch(async (error) => {
    console.error('Migration failed:', error.message);
    await mongoose.disconnect().catch(() => { });
    process.exit(1);
});
