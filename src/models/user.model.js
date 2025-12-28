const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
    street: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    zip: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true },
    isDefault: { type: Boolean, default: false }
});

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
    },
    password: {
        type: String,
        required: function () { return !this.googleId; }, // Only required if not Google login
        minlength: 6,
    },
    googleId: {
        type: String,
        unique: true,
        sparse: true, // Allow multiple nulls
    },
    otp: {
        type: String,
    },
    otpExpires: {
        type: Date,
    },
    isVerified: {
        type: Boolean,
        default: false,
    },
    lastOtpSentAt: {
        type: Date,
    },
    resetOtp: {
        type: String,
    },
    resetOtpExpires: {
        type: Date,
    },
    addresses: [addressSchema],
    newEmail: {
        type: String,
        lowercase: true,
        trim: true,
    },
    emailChangeOtp: {
        type: String,
    },
    emailChangeOtpExpires: {
        type: Date,
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user',
    },
    isBlocked: {
        type: Boolean,
        default: false,
    },
}, {
    timestamps: true,
});

module.exports = mongoose.model('User', userSchema);
