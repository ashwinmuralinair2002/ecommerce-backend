const globalErrorHandler = (err, req, res, next) => {
    console.error(err);

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
