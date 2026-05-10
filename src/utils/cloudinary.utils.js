const cloudinary = require('../config/cloudinary');

function normalizePublicId(publicId) {
    if (typeof publicId !== 'string') return '';
    return publicId.trim();
}

function isDeletableCloudinaryPublicId(publicId) {
    return normalizePublicId(publicId).length > 0;
}

function getCloudinaryPublicId(image) {
    return normalizePublicId(image && image.public_id);
}

async function destroyCloudinaryAsset(publicId) {
    const normalizedPublicId = normalizePublicId(publicId);
    if (!normalizedPublicId) return false;

    try {
        await cloudinary.uploader.destroy(normalizedPublicId);
        return true;
    } catch (error) {
        return false;
    }
}

async function destroyCloudinaryAssets(publicIds = [], options = {}) {
    const excludeIds = new Set(
        Array.isArray(options.excludePublicIds)
            ? options.excludePublicIds
                .map(normalizePublicId)
                .filter(Boolean)
            : []
    );

    const uniquePublicIds = [...new Set(
        publicIds
            .map(normalizePublicId)
            .filter((publicId) => publicId && !excludeIds.has(publicId))
    )];

    if (uniquePublicIds.length === 0) return [];

    return Promise.allSettled(uniquePublicIds.map((publicId) => destroyCloudinaryAsset(publicId)));
}

module.exports = {
    destroyCloudinaryAsset,
    destroyCloudinaryAssets,
    getCloudinaryPublicId,
    isDeletableCloudinaryPublicId
};
