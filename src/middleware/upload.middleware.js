const { createAdminImageUpload } = require('./admin-image-upload.middleware');

module.exports = createAdminImageUpload({
    folder: 'soundwave/products',
    transformation: [{ quality: 'auto' }]
});
