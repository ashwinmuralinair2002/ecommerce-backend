const mongoose = require('mongoose');

const uri = 'mongodb+srv://photosashwinmurali_db_user:qx6gA18ljraH1Ka9@cluster0.re9ixld.mongodb.net/?appName=Cluster0';

async function migrate() {
    await mongoose.connect(uri, {
        dbName: 'test'
    });

    const Product = mongoose.models.Product || mongoose.model('Product', new mongoose.Schema({}, { strict: false }));
    const products = await Product.find({
        originalPrice: { $exists: true, $gt: 0 }
    });

    let updatedCount = 0;
    let skippedCount = 0;
    const logs = [];

    for (const p of products) {
        const title = p.title || p._id;
        const oldPrice = Number(p.price) || 0;
        const op = Number(p.originalPrice) || 0;

        if (oldPrice !== op) {
            logs.push({
                title,
                oldPrice,
                newPrice: op,
                discountPercentage: p.discountPercentage
            });

            await Product.updateOne({ _id: p._id }, { $set: { price: op } });
            updatedCount++;
        } else {
            skippedCount++;
        }
    }

    // Output logs
    console.log(JSON.stringify({
        success: true,
        updatedCount,
        skippedCount,
        logs
    }, null, 2));

    await mongoose.disconnect();
}

migrate().catch(err => {
    console.error(err);
    process.exit(1);
});
