// User schema definition and model
const mongoose = require('mongoose');
const generateReferralCode = require('../utils/generateReferralCode');

const addressSchema = new mongoose.Schema({
    name: { type: String, trim: true },
    phone: { type: String, trim: true },
    houseNo: { type: String, trim: true },
    street: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    zip: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true },
    label: { type: String, trim: true },
    isDefault: { type: Boolean, default: false }
});

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },
    phone: {
        type: String,
        trim: true,
        default: '',
    },
    profileImage: {
        type: String,
        default: null
    },
    email: {
        type: String,
        required: true,
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
    isDeleted: {
        type: Boolean,
        default: false,
    },
    adminNotes: {
        type: String,
        default: '',
    },
    referralCode: {
        type: String,
        unique: true,
        index: true
    },
    referralCount: {
        type: Number,
        default: 0,
        min: 0
    },
    referredBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    hasUsedReferral: {
        type: Boolean,
        default: false
    },
}, {
    timestamps: true,
});

userSchema.pre('save', function () {
    if (!this.referralCode) {
        this.referralCode = generateReferralCode(this);
    }
});

userSchema.index({ email: 1 }, { unique: true });

module.exports = mongoose.model('User', userSchema);
