const { createAdminImageUpload } = require('./admin-image-upload.middleware');

module.exports = createAdminImageUpload({
    folder: 'soundwave_brands',
    transformation: [{ width: 400, height: 400, crop: 'limit' }]
});
