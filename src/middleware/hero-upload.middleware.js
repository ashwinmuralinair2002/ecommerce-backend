const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');
const MESSAGES = require('../constants/messages');

const MAX_HERO_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_HERO_MIMES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const HERO_UPLOAD_FIELDS = [
    { name: 'image', maxCount: 1 },
    { name: 'mobileImage', maxCount: 1 }
];

const storage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: 'soundwave_heroes',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        transformation: [{ quality: 'auto' }]
    }
});

const fileFilter = (req, file, cb) => {
    if (ALLOWED_HERO_MIMES.includes(file.mimetype)) {
        cb(null, true);
        return;
    } else {
        cb(new Error(MESSAGES.HERO_IMAGE_INVALID_TYPE), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: MAX_HERO_IMAGE_SIZE }
});

function getUploadErrorMessage(error) {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        return MESSAGES.HERO_IMAGE_TOO_LARGE;
    }

    return error.message || MESSAGES.HERO_IMAGE_INVALID_TYPE;
}

function wrapUpload(uploadHandler) {
    return (req, res, next) => {
        uploadHandler(req, res, (error) => {
            if (!error) {
                if (!req.file && req.files && Array.isArray(req.files.image) && req.files.image.length > 0) {
                    req.file = req.files.image[0];
                }
                next();
                return;
            }

            req.uploadValidationError = getUploadErrorMessage(error);
            next();
        });
    };
}

module.exports = {
    fields(fieldsConfig = HERO_UPLOAD_FIELDS) {
        return wrapUpload(upload.fields(fieldsConfig));
    }
};
