// Home page controller for public and authenticated views
const Category = require('../models/Category');
const Product = require('../models/Product');
const HeroBanner = require('../models/HeroBanner');
const { resolveHeroBannerRedirectPath, HERO_REDIRECT_FALLBACK_PATH } = require('../services/hero-banner-link.service');
const LEGACY_HOME_HERO_TYPES = ['custom', 'product'];

async function migrateLegacyProductImages(product) {
    if (!product) return product;
    const variants = Array.isArray(product.variants) ? product.variants : [];
    const images = Array.isArray(product.images) ? product.images : [];
    if (variants.length === 0 && images.length >= 3) {
        product.variants = [{
            colorName: 'Default',
            colorCode: '#000000',
            images: images.map((img) => ({ url: img.url, public_id: img.public_id }))
        }];
        product.images = [];
        product.markModified('variants');
        product.markModified('images');
        await product.save();
    }
    return product;
}

// Helper: fetch products by badge
async function getProductsByBadge(badge, allowedCategoryIds, limit = 8) {
    const docs = await Product.find({
        badges: badge,
        isListed: true,
        isDeleted: { $ne: true },
        category: { $in: allowedCategoryIds }
    })
        .sort({ createdAt: -1 })
        .limit(limit);
    for (const doc of docs) {
        await migrateLegacyProductImages(doc);
    }
    return docs.map((doc) => doc.toObject());
}

// Public Landing Page
exports.getHomePage = async (req, res) => {
    console.log("🔥 ROOT getHomePage HIT");
    try {
        const categories = await Category.find({ isBlocked: { $ne: true }, isDeleted: { $ne: true } }).sort({ name: 1 }).lean();
        const categoryIds = categories.map(c => c._id);
        const [bestSellers, newArrivals, deals, heroBanners] = await Promise.all([
            getProductsByBadge('Best seller', categoryIds),
            getProductsByBadge('New', categoryIds),
            getProductsByBadge('Deal', categoryIds),
            HeroBanner.find({
                isActive: true,
                $or: [
                    { placements: 'home' },
                    {
                        type: { $in: LEGACY_HOME_HERO_TYPES },
                        $or: [
                            { placements: { $exists: false } },
                            { placements: null },
                            { placements: { $size: 0 } }
                        ]
                    }
                ]
            })
                .select('image mobileImage type refId order')
                .sort({ order: 1 })
                .limit(10)
                .lean()
        ]);
        res.render('user/home', {
            categories,
            bestSellers,
            newArrivals,
            deals,
            heroBanners: heroBanners || []
        });
    } catch (error) {
        console.error('Error loading home page:', error);
        res.render('user/home', { categories: [], bestSellers: [], newArrivals: [], deals: [], heroBanners: [] });
    }
};

exports.getAboutPage = (req, res) => {
    res.render('user/about');
};

exports.getContactPage = (req, res) => {
    res.render('user/contact');
};

exports.getPrivacyPolicyPage = (req, res) => {
    res.render('user/privacy-policy');
};

exports.getTermsOfServicePage = (req, res) => {
    res.render('user/terms-of-service');
};

exports.redirectHeroBanner = async (req, res) => {
    try {
        const banner = await HeroBanner.findById(req.params.id).lean();
        const redirectPath = await resolveHeroBannerRedirectPath(banner);
        return res.redirect(redirectPath);
    } catch (error) {
        return res.redirect(HERO_REDIRECT_FALLBACK_PATH);
    }
};
