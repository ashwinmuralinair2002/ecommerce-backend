const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');
const HTTP_STATUS = require('../constants/http-status');
const MESSAGES = require('../constants/messages');

const storage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: 'soundwave_profiles',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        transformation: [{ width: 500, height: 500, crop: 'fill' }]
    }
});

const fileFilter = (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
        return;
    }

    cb(new Error(MESSAGES.PROFILE_IMAGE_INVALID_TYPE), false);
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 2 * 1024 * 1024 }
});

const profileImageUpload = upload.single('profileImage');

const handleProfileImageUpload = (req, res, next) => {
    profileImageUpload(req, res, (error) => {
        if (!error) {
            next();
            return;
        }

        if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                message: MESSAGES.PROFILE_IMAGE_TOO_LARGE,
                error: MESSAGES.PROFILE_IMAGE_TOO_LARGE
            });
        }

        const message = error.message || MESSAGES.PROFILE_IMAGE_INVALID_TYPE;
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
            message,
            error: message
        });
    });
};

module.exports = {
    handleProfileImageUpload
};
