const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');
const HTTP_STATUS = require('../constants/http-status');
const MESSAGES = require('../constants/messages');

const MAX_IMAGE_SIZE = 2 * 1024 * 1024;
const ALLOWED_FORMATS = ['jpg', 'jpeg', 'png', 'webp'];
const ALLOWED_MIMES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

function buildStorage(params) {
    return new CloudinaryStorage({
        cloudinary,
        params: {
            allowed_formats: ALLOWED_FORMATS,
            ...params
        }
    });
}

function imageFileFilter(req, file, cb) {
    if (ALLOWED_MIMES.includes(file.mimetype)) {
        cb(null, true);
        return;
    }

    cb(new Error(MESSAGES.ADMIN_IMAGE_INVALID_TYPE), false);
}

function getUploadErrorMessage(error) {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        return MESSAGES.ADMIN_IMAGE_TOO_LARGE;
    }

    return error.message || MESSAGES.ADMIN_IMAGE_INVALID_TYPE;
}

function respondToUploadError(req, res, nextMode, message, next) {
    if (nextMode === 'json') {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
            message,
            error: message
        });
    }

    req.uploadValidationError = message;
    return next();
}

function wrapUpload(uploadHandler, nextMode = 'request') {
    return (req, res, next) => {
        uploadHandler(req, res, (error) => {
            if (!error) {
                next();
                return;
            }

            const message = getUploadErrorMessage(error);
            respondToUploadError(req, res, nextMode, message, next);
        });
    };
}

function createAdminImageUpload(storageParams) {
    const upload = multer({
        storage: buildStorage(storageParams),
        fileFilter: imageFileFilter,
        limits: { fileSize: MAX_IMAGE_SIZE }
    });

    return {
        single(fieldName, nextMode = 'request') {
            return wrapUpload(upload.single(fieldName), nextMode);
        },
        fields(fieldConfig, nextMode = 'request') {
            return wrapUpload(upload.fields(fieldConfig), nextMode);
        },
        any(nextMode = 'request') {
            return wrapUpload(upload.any(), nextMode);
        }
    };
}

module.exports = {
    createAdminImageUpload,
    MAX_IMAGE_SIZE,
    ALLOWED_MIMES
};
