const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'soundwave_profiles', // Cloudinary folder name
        allowed_formats: ['jpg', 'jpeg'], // Restrict allow formats
        transformation: [{ width: 500, height: 500, crop: 'fill' }] // Resize for avatar usage
    },
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 2 * 1024 * 1024 } // 2MB Limit
});

module.exports = upload;
