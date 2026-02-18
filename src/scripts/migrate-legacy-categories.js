require('dotenv').config();
const mongoose = require('mongoose');
const Category = require('../models/Category');

function slugify(value) {
    return String(value || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
}

async function buildUniqueSlug(baseSlug, excludeId = null) {
    let slug = baseSlug || `category-${Date.now()}`;
    let i = 1;
    while (true) {
        const query = { slug };
        if (excludeId) query._id = { $ne: excludeId };
        const exists = await Category.findOne(query).select('_id').lean();
        if (!exists) return slug;
        slug = `${baseSlug}-${i++}`;
    }
}

async function run() {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) throw new Error('Missing MONGODB_URI/MONGO_URI');

    await mongoose.connect(uri);
    const categories = await Category.find({}).lean();
    console.log(`Found ${categories.length} categories`);

    let updated = 0;
    for (const cat of categories) {
        const set = {};

        if (typeof cat.isDeleted === 'undefined') set.isDeleted = false;
        if (typeof cat.isBlocked === 'undefined') set.isBlocked = false;
        if (!cat.description) set.description = '';
        if (!cat.slug) set.slug = await buildUniqueSlug(slugify(cat.name), cat._id);

        const legacyImageUrl = cat.imageUrl || '';
        const hasNewImage = cat.image && cat.image.url;
        if (!hasNewImage) {
            set.image = {
                url: legacyImageUrl || '',
                public_id: ''
            };
        }

        if (!cat.heroImage || (!cat.heroImage.url && !cat.heroImage.public_id)) {
            set.heroImage = {
                url: '',
                public_id: ''
            };
        }

        if (Object.keys(set).length > 0) {
            await Category.updateOne({ _id: cat._id }, { $set: set });
            updated += 1;
            console.log(`Updated: ${cat.name}`);
        }
    }

    console.log(`Migration complete. Updated ${updated} categories.`);
    await mongoose.disconnect();
}

run().catch(async (err) => {
    console.error('Migration failed:', err.message);
    await mongoose.disconnect().catch(() => { });
    process.exit(1);
});
