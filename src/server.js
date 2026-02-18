// Server entry point and port listener
require('dotenv').config();
const connectDB = require('./config/db');
const app = require('./app');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
    await connectDB();
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
};

startServer();

// DEV MODE OVERRIDE: Intercept responses to inject OTP
const User = require('./models/user.model');

app.use((req, res, next) => {
    const originalJson = res.json;
    res.json = function (body) {
        if (process.env.NODE_ENV !== 'production' && body) {
            // Check if this is an Auth response we care about
            const isAuthSignup = req.url.includes('/signup') && body.user && body.user.email;
            const isAuthResend = req.url.includes('/resend-otp') && req.body.email; // Body might be parsed

            const targetEmail = (isAuthSignup ? body.user.email : null) || (isAuthResend ? req.body.email : null);

            if (targetEmail) {
                console.error('--- INTERCEPTING RESPONSE FOR:', targetEmail, '---');
                // We need to fetch OTP asynchronously, but res.json is sync-style usually.
                // We will hijack the flow.
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
                return; // Defer sending
            }
        }
        return originalJson.call(this, body);
    };
    next();
});
