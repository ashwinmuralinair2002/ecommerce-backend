const logger = require('../utils/logger');

const globalErrorHandler = (err, req, res, next) => {
    logger.error(err.message, {
        stack: err.stack,
        url: req.originalUrl,
        method: req.method,
        user: req.user?._id || req.session?.userId || null
    });

    if (res.headersSent) {
        return next(err);
    }

    const isOperational = err && err.isOperational === true;
    const statusCode = isOperational ? err.statusCode : 500;
    const message = isOperational ? err.message : 'Something went wrong';
    const accepts = req && req.headers ? req.headers.accept : '';
    const wantsJson = Boolean(req.xhr) || (typeof accepts === 'string' && accepts.includes('json'));

    if (wantsJson) {
        return res.status(statusCode).json({
            success: false,
            message
        });
    }

    return res.status(statusCode).send(message);
};

module.exports = globalErrorHandler;
