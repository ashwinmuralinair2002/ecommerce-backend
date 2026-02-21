const globalErrorHandler = (err, req, res, next) => {
    console.error('Unhandled Error:', err);
    res.status(500).json({ error: err.message || 'Server Error' });
};

module.exports = globalErrorHandler;
