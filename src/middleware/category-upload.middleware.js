const { createAdminImageUpload } = require('./admin-image-upload.middleware');

const baseUpload = createAdminImageUpload({
    folder: 'soundwave_categories'
});

function syncSingleCategoryFileShape(handler) {
    return (req, res, next) => {
        handler(req, res, () => {
            if (req.file) {
                req.files = {
                    ...(req.files || {}),
                    image: [req.file]
                };
            }
            next();
        });
    };
}

module.exports = {
    single(fieldName, nextMode = 'request') {
        return syncSingleCategoryFileShape(baseUpload.single(fieldName, nextMode));
    }
};
