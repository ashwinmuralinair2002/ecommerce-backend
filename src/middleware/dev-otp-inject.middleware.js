const User = require('../models/user.model');

const injectDevOtp = (req, res, next) => {
    const originalJson = res.json;
    res.json = function (body) {
        if (process.env.NODE_ENV !== 'production' && body) {
            const target = req.originalUrl;
            const isTarget = target.includes('/api/auth/signup') || target.includes('/api/auth/resend-otp');

            if (isTarget) {
                const targetEmail = (body.user && body.user.email) || (req.body && req.body.email);
                if (targetEmail) {
                    console.error('--- INTERCEPTING RESPONSE FOR:', targetEmail, '---');
                    User.findOne({ email: targetEmail }).then(user => {
                        if (user && user.otp) {
                            body.devOtp = user.otp;
                            console.error('--- INJECTED OTP:', user.otp, '---');
                        }
                        originalJson.call(this, body);
                    }).catch(err => {
                        console.error('--- OTP INJECTION FAILED:', err);
                        originalJson.call(this, body);
                    });
                    return;
                }
            }
        }
        return originalJson.call(this, body);
    };
    next();
};

module.exports = injectDevOtp;
