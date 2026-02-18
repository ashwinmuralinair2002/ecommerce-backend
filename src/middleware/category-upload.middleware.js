const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');

const storage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: 'soundwave_categories',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp']
    }
});

module.exports = multer({
    storage,
    limits: { fileSize: 4 * 1024 * 1024 }
});

