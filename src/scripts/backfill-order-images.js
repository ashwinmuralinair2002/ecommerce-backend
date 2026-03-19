const connectDB = require('../config/db');
const Order = require('../models/order.model');
const Product = require('../models/Product');

const getFallbackImage = async (productId) => {
    if (!productId) {
        return '';
    }

    const product = await Product.findById(productId).lean();

    if (
        product &&
        Array.isArray(product.variants) &&
        product.variants.length > 0 &&
        Array.isArray(product.variants[0].images) &&
        product.variants[0].images.length > 0 &&
        product.variants[0].images[0].url
    ) {
        return product.variants[0].images[0].url;
    }

    return '';
};

const backfillOrderImages = async () => {
    await connectDB();

    const orders = await Order.find({
        deleted: { $ne: true },
        items: {
            $elemMatch: {
                $or: [
                    { imageUrl: { $exists: false } },
                    { imageUrl: '' }
                ]
            }
        }
    });

    let updatedOrders = 0;
    let updatedItems = 0;

    for (const order of orders) {
        let orderChanged = false;

        for (const item of order.items) {
            if (typeof item.imageUrl === 'string' && item.imageUrl.trim() !== '') {
                continue;
            }

            const fallbackImage = await getFallbackImage(item.productId);

            if (!fallbackImage) {
                continue;
            }

            item.imageUrl = fallbackImage;
            orderChanged = true;
            updatedItems += 1;
        }

        if (!orderChanged) {
            continue;
        }

        await order.save();
        updatedOrders += 1;
    }

    console.log(`Backfill complete. Updated ${updatedItems} item(s) across ${updatedOrders} order(s).`);
    process.exit(0);
};

backfillOrderImages().catch((error) => {
    console.error('Failed to backfill order images:', error);
    process.exit(1);
});
