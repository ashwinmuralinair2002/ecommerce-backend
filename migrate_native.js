const mongoose = require('mongoose');

const uri = 'mongodb+srv://photosashwinmurali_db_user:qx6gA18ljraH1Ka9@cluster0.re9ixld.mongodb.net/?appName=Cluster0';

async function migrate() {
    await mongoose.connect(uri, {
        dbName: 'test'
    });

    const productsCollection = mongoose.connection.db.collection('products');
    const products = await productsCollection.find({
        originalPrice: { $exists: true, $type: 'number', $gt: 0 }
    }).toArray();

    let updatedCount = 0;
    let skippedCount = 0;
    const logs = [];

    for (const p of products) {
        const title = p.title || p._id.toString();
        const oldPrice = Number(p.price) || 0;
        const op = Number(p.originalPrice) || 0;

        if (oldPrice !== op) {
            logs.push({
                title,
                oldPrice,
                newPrice: op,
                discountPercentage: p.discountPercentage
            });

            await productsCollection.updateOne({ _id: p._id }, { $set: { price: op } });
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
    process.exit(0);
}

migrate().catch(err => {
    console.error(err);
    process.exit(1);
});
