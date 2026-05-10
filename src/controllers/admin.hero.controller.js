const mongoose = require('mongoose');
const HeroBanner = require('../models/HeroBanner');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Brand = require('../models/Brand');
const HTTP_STATUS = require('../constants/http-status');
const { parseBoolean, parseOrder } = require('../utils/validation.utils');
const { getFriendlyError } = require('../utils/string.utils');
const {
    destroyCloudinaryAssets,
    getCloudinaryPublicId,
    isDeletableCloudinaryPublicId
} = require('../utils/cloudinary.utils');

const MAX_ACTIVE_HERO_BANNERS = 10;
const MAX_ACTIVE_ERROR = 'Maximum 10 active hero banners allowed. Please unlist one before activating another.';
const HERO_TYPES = ['product', 'category', 'brand', 'custom'];
const HERO_SEARCHABLE_TYPES = ['product', 'category', 'brand'];
const HERO_PLACEMENTS = ['home', 'brand', 'category'];

function buildPlacementFilterQuery(placement) {
    if (!HERO_PLACEMENTS.includes(placement)) {
        return null;
    }

    const fallbackTypes = placement === 'home'
        ? ['product', 'custom']
        : placement === 'brand'
            ? ['brand']
            : ['category'];

    return {
        $or: [
            { placements: placement },
            {
                type: { $in: fallbackTypes },
                $or: [
                    { placements: { $exists: false } },
                    { placements: null },
                    { placements: { $size: 0 } }
                ]
            }
        ]
    };
}

function appendAndCondition(query, condition) {
    if (!condition || typeof condition !== 'object') {
        return;
    }

    if (!Array.isArray(query.$and)) {
        query.$and = [];
    }

    query.$and.push(condition);
}

function parseOptionalObjectId(value) {
    if (value === undefined || value === null || value === '') return null;
    if (!mongoose.Types.ObjectId.isValid(value)) {
        const error = new Error('Invalid reference selected.');
        error.statusCode = 400;
        throw error;
    }
    return value;
}

function normalizeHeroPlacementsInput(value) {
    if (Array.isArray(value)) {
        return value.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean);
    }

    if (typeof value === 'string' && value.trim()) {
        return [value.trim().toLowerCase()];
    }

    return [];
}

function getDefaultPlacementForType(type) {
    if (type === 'product') return 'home';
    return HERO_PLACEMENTS.includes(type) ? type : null;
}

function parseHeroPlacements(value, type) {
    const rawPlacements = normalizeHeroPlacementsInput(value);
    const uniquePlacements = [...new Set(rawPlacements)];
    const hasInvalidPlacement = uniquePlacements.some((placement) => !HERO_PLACEMENTS.includes(placement));

    if (hasInvalidPlacement) {
        const error = new Error('Please select valid hero placements.');
        error.statusCode = 400;
        throw error;
    }

    if (uniquePlacements.length > 0) {
        return uniquePlacements;
    }

    const fallbackPlacement = getDefaultPlacementForType(type);
    return fallbackPlacement ? [fallbackPlacement] : [];
}

function getEffectiveHeroPlacements(heroLike) {
    const existingPlacements = Array.isArray(heroLike?.placements)
        ? heroLike.placements.map((placement) => String(placement || '').trim().toLowerCase()).filter(Boolean)
        : [];

    const validPlacements = [...new Set(existingPlacements)].filter((placement) => HERO_PLACEMENTS.includes(placement));
    if (validPlacements.length > 0) {
        return validPlacements;
    }

    const fallbackPlacement = getDefaultPlacementForType(String(heroLike?.type || '').trim().toLowerCase());
    return fallbackPlacement ? [fallbackPlacement] : [];
}

function parseHeroImageFromFile(file, fallbackImage = null) {
    if (file && file.path && file.filename) {
        return {
            url: file.path,
            public_id: file.filename
        };
    }
    return fallbackImage;
}

function getDesktopHeroImageFile(req) {
    return req.files?.image?.[0] || null;
}

function getMobileHeroImageFile(req) {
    return req.files?.mobileImage?.[0] || null;
}

function buildHeroImagePayload(req, fallbackImage = null) {
    return parseHeroImageFromFile(getDesktopHeroImageFile(req), fallbackImage);
}

function buildMobileHeroImagePayload(req, fallbackImage = null) {
    return parseHeroImageFromFile(getMobileHeroImageFile(req), fallbackImage);
}

function getHeroReplacementAssetIds(hero, nextDesktopImage, nextMobileImage) {
    const assetIdsToDelete = [];
    const currentDesktopPublicId = getCloudinaryPublicId(hero && hero.image);
    const nextDesktopPublicId = getCloudinaryPublicId(nextDesktopImage);
    const currentMobilePublicId = getCloudinaryPublicId(hero && hero.mobileImage);
    const nextMobilePublicId = getCloudinaryPublicId(nextMobileImage);

    if (nextDesktopPublicId && currentDesktopPublicId && currentDesktopPublicId !== nextDesktopPublicId) {
        assetIdsToDelete.push(currentDesktopPublicId);
    }

    if (nextMobilePublicId && currentMobilePublicId && currentMobilePublicId !== nextMobilePublicId) {
        assetIdsToDelete.push(currentMobilePublicId);
    }

    return assetIdsToDelete.filter(isDeletableCloudinaryPublicId);
}

function getHeroAssetIdsForDeletion(hero) {
    return [
        getCloudinaryPublicId(hero && hero.image),
        getCloudinaryPublicId(hero && hero.mobileImage)
    ].filter(isDeletableCloudinaryPublicId);
}

function getEmptyHeroMobileImage() {
    return {
        url: null,
        public_id: null
    };
}

async function enforceMaxActiveLimit(excludeId = null) {
    const query = { isActive: true };
    if (excludeId) {
        query._id = { $ne: excludeId };
    }

    const activeCount = await HeroBanner.countDocuments(query);
    if (activeCount >= MAX_ACTIVE_HERO_BANNERS) {
        const error = new Error(MAX_ACTIVE_ERROR);
        error.statusCode = 400;
        throw error;
    }
}

async function loadReferenceData() {
    const [products, categories, brands] = await Promise.all([
        Product.find({ isDeleted: { $ne: true } }).select('_id title').sort({ title: 1 }).lean(),
        Category.find({ isDeleted: { $ne: true } }).select('_id name').sort({ name: 1 }).lean(),
        Brand.find({ isDeleted: { $ne: true } }).select('_id name').sort({ name: 1 }).lean()
    ]);

    return {
        products,
        categories,
        brands
    };
}

async function renderAddPage(res, payload) {
    const refs = await loadReferenceData();
    return res.status(payload.statusCode || 200).render('admin/heroes/add', {
        page: 'heroes',
        error: payload.error || null,
        errors: payload.errors || {},
        oldInput: payload.oldInput || {},
        refs,
        heroPlacements: HERO_PLACEMENTS,
        maxActiveError: MAX_ACTIVE_ERROR
    });
}

async function renderEditPage(res, hero, payload) {
    const refs = await loadReferenceData();
    return res.status(payload.statusCode || 200).render('admin/heroes/edit', {
        page: 'heroes',
        error: payload.error || null,
        success: payload.success || null,
        errors: payload.errors || {},
        oldInput: payload.oldInput || null,
        hero,
        refs,
        heroEffectivePlacements: getEffectiveHeroPlacements(payload.oldInput || hero),
        heroPlacements: HERO_PLACEMENTS,
        maxActiveError: MAX_ACTIVE_ERROR
    });
}

async function findMatchingReferenceIds(type, search) {
    const searchRegex = new RegExp(search, 'i');

    if (type === 'brand') {
        const brands = await Brand.find({
            isDeleted: { $ne: true },
            name: searchRegex
        }).select('_id').lean();
        return brands.map((item) => item._id);
    }

    if (type === 'category') {
        const categories = await Category.find({
            isDeleted: { $ne: true },
            name: searchRegex
        }).select('_id').lean();
        return categories.map((item) => item._id);
    }

    if (type === 'product') {
        const products = await Product.find({
            isDeleted: { $ne: true },
            title: searchRegex
        }).select('_id').lean();
        return products.map((item) => item._id);
    }

    return [];
}

async function hydrateHeroReferences(heroes) {
    const groupedRefIds = {
        brand: [],
        category: [],
        product: []
    };

    for (const hero of heroes) {
        if (!hero || !hero.refId || !HERO_SEARCHABLE_TYPES.includes(hero.type)) continue;
        groupedRefIds[hero.type].push(hero.refId);
    }

    const [brands, categories, products] = await Promise.all([
        groupedRefIds.brand.length > 0
            ? Brand.find({ _id: { $in: groupedRefIds.brand }, isDeleted: { $ne: true } }).select('_id name').lean()
            : [],
        groupedRefIds.category.length > 0
            ? Category.find({ _id: { $in: groupedRefIds.category }, isDeleted: { $ne: true } }).select('_id name').lean()
            : [],
        groupedRefIds.product.length > 0
            ? Product.find({ _id: { $in: groupedRefIds.product }, isDeleted: { $ne: true } }).select('_id title').lean()
            : []
    ]);

    const brandMap = new Map(brands.map((item) => [String(item._id), item]));
    const categoryMap = new Map(categories.map((item) => [String(item._id), item]));
    const productMap = new Map(products.map((item) => [String(item._id), item]));

    return heroes.map((hero) => {
        if (!hero || !hero.refId || !HERO_SEARCHABLE_TYPES.includes(hero.type)) {
            return hero;
        }

        const refKey = String(hero.refId);
        const refDoc =
            hero.type === 'brand' ? brandMap.get(refKey)
                : hero.type === 'category' ? categoryMap.get(refKey)
                    : productMap.get(refKey);

        return {
            ...hero,
            refId: refDoc || hero.refId
        };
    });
}

exports.getAllHeroes = async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = 5;
        const skip = (page - 1) * limit;
        const type = typeof req.query.type === 'string' && HERO_TYPES.includes(req.query.type.trim())
            ? req.query.type.trim()
            : '';
        const placement = typeof req.query.placement === 'string' && HERO_PLACEMENTS.includes(req.query.placement.trim())
            ? req.query.placement.trim()
            : '';
        const refId = typeof req.query.refId === 'string' ? req.query.refId.trim() : '';
        const isActive = typeof req.query.isActive === 'string' ? req.query.isActive.trim().toLowerCase() : '';
        const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
        const query = {};

        if (type) {
            query.type = type;
        }

        if (refId) {
            if (!mongoose.Types.ObjectId.isValid(refId)) {
                query._id = null;
            } else {
                query.refId = new mongoose.Types.ObjectId(refId);
            }
        }

        if (isActive === 'active') {
            query.isActive = true;
        } else if (isActive === 'inactive') {
            query.isActive = false;
        }

        if (placement) {
            const placementQuery = buildPlacementFilterQuery(placement);
            if (placementQuery) {
                appendAndCondition(query, placementQuery);
            }
        }

        if (search) {
            if (type && HERO_SEARCHABLE_TYPES.includes(type)) {
                const matchingRefIds = await findMatchingReferenceIds(type, search);
                if (query.refId) {
                    const selectedRefId = String(query.refId);
                    query.refId = matchingRefIds.some((id) => String(id) === selectedRefId)
                        ? query.refId
                        : { $in: [] };
                } else {
                    query.refId = {
                        $in: matchingRefIds.length > 0 ? matchingRefIds : []
                    };
                }
            } else {
                const searchMatches = await Promise.all(
                    HERO_SEARCHABLE_TYPES.map(async (heroType) => ({
                        heroType,
                        ids: await findMatchingReferenceIds(heroType, search)
                    }))
                );

                const orConditions = searchMatches
                    .filter((match) => match.ids.length > 0)
                    .map((match) => ({
                        type: match.heroType,
                        refId: { $in: match.ids }
                    }));

                appendAndCondition(query, {
                    $or: orConditions.length > 0 ? orConditions : [{ _id: null }]
                });
            }
        }

        const [heroes, activeCount, totalHeroes, refs] = await Promise.all([
            HeroBanner.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            HeroBanner.countDocuments({ isActive: true }),
            HeroBanner.countDocuments(query),
            loadReferenceData()
        ]);
        const hydratedHeroes = await hydrateHeroReferences(heroes);

        const totalPages = Math.max(1, Math.ceil(totalHeroes / limit));
        const pagination = {
            currentPage: page,
            totalPages,
            totalItems: totalHeroes,
            hasPrevPage: page > 1,
            hasNextPage: page < totalPages
        };

        return res.render('admin/heroes/list', {
            page: 'heroes',
            heroes: hydratedHeroes,
            activeCount,
            pagination,
            filters: {
                type,
                placement,
                refId,
                isActive,
                search
            },
            refs,
            maxActiveError: MAX_ACTIVE_ERROR,
            error: req.query.error || null,
            success: req.query.success || null
        });
    } catch (error) {
        return res.render('admin/heroes/list', {
            page: 'heroes',
            heroes: [],
            activeCount: 0,
            pagination: {
                currentPage: 1,
                totalPages: 1,
                totalItems: 0,
                hasPrevPage: false,
                hasNextPage: false
            },
            filters: {
                type: '',
                placement: '',
                refId: '',
                isActive: '',
                search: ''
            },
            refs: {
                products: [],
                categories: [],
                brands: []
            },
            maxActiveError: MAX_ACTIVE_ERROR,
            error: 'Failed to load hero banners.',
            success: null
        });
    }
};

exports.getAddHero = async (req, res) => {
    try {
        return await renderAddPage(res, {
            oldInput: {
                type: 'custom',
                placements: [],
                refId: '',
                order: 0,
                isActive: true
            }
        });
    } catch (error) {
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send('Failed to load add hero page.');
    }
};

exports.getEditHero = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.redirect('/admin/heroes?error=Invalid%20hero%20banner%20id.');
        }

        const hero = await HeroBanner.findById(id).lean();
        if (!hero) {
            return res.redirect('/admin/heroes?error=Hero%20banner%20not%20found.');
        }

        return await renderEditPage(res, hero, {
            error: req.query.error || null,
            success: req.query.success || null
        });
    } catch (error) {
        return res.redirect('/admin/heroes?error=Failed%20to%20load%20hero%20banner.');
    }
};

exports.createHero = async (req, res) => {
    try {
        if (req.uploadValidationError) {
            return await renderAddPage(res, {
                statusCode: 400,
                error: req.uploadValidationError,
                errors: {},
                oldInput: {
                    type: req.body?.type || 'custom',
                    placements: normalizeHeroPlacementsInput(req.body?.placements),
                    refId: req.body?.refId || '',
                    order: req.body?.order || 0,
                    isActive: parseBoolean(req.body?.isActive, false)
                }
            });
        }

        const errors = {};
        const type = String(req.body?.type || '').trim();
        let placements = [];
        const refId = parseOptionalObjectId(req.body?.refId);
        const order = parseOrder(req.body?.order, 0);
        const isActive = parseBoolean(req.body?.isActive, false);

        if (!HERO_TYPES.includes(type)) {
            errors.type = 'Please select a valid hero type.';
        }

        try {
            placements = parseHeroPlacements(req.body?.placements, type);
        } catch (error) {
            errors.placements = error.message;
        }

        const image = buildHeroImagePayload(req, null);
        const mobileImage = buildMobileHeroImagePayload(req, null);
        if (!image) {
            errors.image = 'Hero image is required.';
        }

        if (Object.keys(errors).length > 0) {
            return await renderAddPage(res, {
                statusCode: 400,
                errors,
                oldInput: {
                    type,
                    placements: normalizeHeroPlacementsInput(req.body?.placements),
                    refId: req.body?.refId || '',
                    order: req.body?.order || 0,
                    isActive
                }
            });
        }

        if (isActive) {
            await enforceMaxActiveLimit();
        }

        await HeroBanner.create({
            type,
            placements,
            refId,
            headline: '',
            subHeadline: '',
            ctaText: 'Shop Now',
            ctaLink: '',
            image,
            mobileImage,
            order,
            isActive
        });

        return res.redirect('/admin/heroes?success=Hero%20banner%20created%20successfully.');
    } catch (error) {
        return await renderAddPage(res, {
            statusCode: error.statusCode || 500,
            error: getFriendlyError(error, 'Failed to create hero banner.'),
            oldInput: {
                type: req.body?.type || 'custom',
                placements: normalizeHeroPlacementsInput(req.body?.placements),
                refId: req.body?.refId || '',
                order: req.body?.order || 0,
                isActive: parseBoolean(req.body?.isActive, false)
            }
        });
    }
};

exports.updateHero = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.redirect('/admin/heroes?error=Invalid%20hero%20banner%20id.');
        }

        const hero = await HeroBanner.findById(id);
        if (!hero) {
            return res.redirect('/admin/heroes?error=Hero%20banner%20not%20found.');
        }

        if (req.uploadValidationError) {
            return await renderEditPage(res, hero.toObject(), {
                statusCode: 400,
                error: req.uploadValidationError,
                errors: {},
                oldInput: {
                    type: req.body?.type || hero.type,
                    placements: normalizeHeroPlacementsInput(req.body?.placements),
                    refId: req.body?.refId || (hero.refId ? String(hero.refId) : ''),
                    order: req.body?.order || hero.order || 0,
                    isActive: parseBoolean(req.body?.isActive, false)
                }
            });
        }

        const errors = {};
        const type = String(req.body?.type || '').trim();
        let placements = [];
        const refId = parseOptionalObjectId(req.body?.refId);
        const order = parseOrder(req.body?.order, hero.order || 0);
        const isActive = parseBoolean(req.body?.isActive, false);

        if (!HERO_TYPES.includes(type)) {
            errors.type = 'Please select a valid hero type.';
        }

        try {
            placements = parseHeroPlacements(req.body?.placements, type);
        } catch (error) {
            errors.placements = error.message;
        }

        if (Object.keys(errors).length > 0) {
            return await renderEditPage(res, hero.toObject(), {
                statusCode: 400,
                errors,
                oldInput: {
                    type,
                    placements: normalizeHeroPlacementsInput(req.body?.placements),
                    refId: req.body?.refId || '',
                    order: req.body?.order || hero.order || 0,
                    isActive
                }
            });
        }

        if (isActive) {
            await enforceMaxActiveLimit(hero._id);
        }

        const updatedImage = buildHeroImagePayload(req, hero.image);
        const updatedMobileImage = buildMobileHeroImagePayload(req, hero.mobileImage || null);
        const oldAssetIdsToDelete = getHeroReplacementAssetIds(hero, updatedImage, updatedMobileImage);

        hero.type = type;
        hero.placements = placements;
        hero.refId = refId;
        hero.order = order;
        hero.isActive = isActive;
        hero.image = updatedImage;
        hero.mobileImage = updatedMobileImage;

        await hero.save();
        await destroyCloudinaryAssets(oldAssetIdsToDelete, {
            excludePublicIds: [
                getCloudinaryPublicId(hero.image),
                getCloudinaryPublicId(hero.mobileImage)
            ]
        });

        return res.redirect('/admin/heroes?success=Hero%20banner%20updated%20successfully.');
    } catch (error) {
        const hero = await HeroBanner.findById(req.params.id).lean().catch(() => null);
        if (!hero) {
            return res.redirect('/admin/heroes?error=Failed%20to%20update%20hero%20banner.');
        }

        return await renderEditPage(res, hero, {
            statusCode: error.statusCode || 500,
            error: getFriendlyError(error, 'Failed to update hero banner.'),
            oldInput: {
                type: req.body?.type || hero.type,
                placements: normalizeHeroPlacementsInput(req.body?.placements),
                refId: req.body?.refId || (hero.refId ? String(hero.refId) : ''),
                order: req.body?.order || hero.order || 0,
                isActive: parseBoolean(req.body?.isActive, false)
            }
        });
    }
};

exports.toggleHeroStatus = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.redirect('/admin/heroes?error=Invalid%20hero%20banner%20id.');
        }

        const hero = await HeroBanner.findById(id);
        if (!hero) {
            return res.redirect('/admin/heroes?error=Hero%20banner%20not%20found.');
        }

        const nextStatus = !hero.isActive;
        if (nextStatus) {
            await enforceMaxActiveLimit(hero._id);
        }

        hero.isActive = nextStatus;
        await hero.save();

        return res.redirect(`/admin/heroes?success=Hero%20banner%20${nextStatus ? 'activated' : 'deactivated'}%20successfully.`);
    } catch (error) {
        return res.redirect(`/admin/heroes?error=${encodeURIComponent(getFriendlyError(error, 'Failed to toggle hero banner status.'))}`);
    }
};

exports.deleteHero = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.redirect('/admin/heroes?error=Invalid%20hero%20banner%20id.');
        }

        const hero = await HeroBanner.findById(id);
        if (!hero) {
            return res.redirect('/admin/heroes?error=Hero%20banner%20not%20found.');
        }

        await destroyCloudinaryAssets(getHeroAssetIdsForDeletion(hero));
        await hero.deleteOne();

        return res.redirect('/admin/heroes?success=Hero%20banner%20deleted%20successfully.');
    } catch (error) {
        return res.redirect('/admin/heroes?error=Failed%20to%20delete%20hero%20banner.');
    }
};

exports.removeHeroMobileImage = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.redirect('/admin/heroes?error=Invalid%20hero%20banner%20id.');
        }

        const hero = await HeroBanner.findById(id);
        if (!hero) {
            return res.redirect('/admin/heroes?error=Hero%20banner%20not%20found.');
        }

        const oldMobilePublicId = getCloudinaryPublicId(hero.mobileImage);

        hero.set('mobileImage', getEmptyHeroMobileImage());
        hero.markModified('mobileImage');
        await hero.save();
        await destroyCloudinaryAssets([oldMobilePublicId]);

        return res.redirect(`/admin/heroes/${id}/edit?success=${encodeURIComponent('Mobile hero image removed successfully.')}`);
    } catch (error) {
        return res.redirect(`/admin/heroes/${req.params.id}/edit?error=${encodeURIComponent(getFriendlyError(error, 'Failed to remove mobile hero image.'))}`);
    }
};
