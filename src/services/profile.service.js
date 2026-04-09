// User profile and address management service
const User = require('../models/user.model');
const bcrypt = require('bcryptjs');
const emailService = require('./email.service');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const HTTP_STATUS = require('../constants/http-status');

// Get Profile
const getProfile = asyncHandler(async (userId) => {
    const user = await User.findById(userId).select('-password -otp -otpExpires -resetOtp -resetOtpExpires -emailChangeOtp -emailChangeOtpExpires');
    if (!user) {
        throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
    }
    return user;
});

// Update Profile (Name only for now, can extend)
const updateProfile = asyncHandler(async (userId, data) => {
    const user = await User.findById(userId);
    if (!user) {
        throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
    }

    if (data.phone) {
        const existingUser = await User.findOne({ phone: data.phone });
        if (existingUser && existingUser._id.toString() !== userId.toString()) {
            throw new AppError('Phone number already in use', HTTP_STATUS.BAD_REQUEST);
        }
    }

    if (data.name) user.name = data.name;
    if (data.phone) user.phone = data.phone;
    if (data.profileImage) user.profileImage = data.profileImage;

    await user.save();
    return {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        profileImage: user.profileImage,
        addresses: user.addresses
    };
});

// Request Email Change
const requestEmailChange = asyncHandler(async (userId, newEmail) => {
    const user = await User.findById(userId);
    if (!user) throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);

    if (newEmail === user.email) throw new AppError('New email cannot be same as current email', HTTP_STATUS.BAD_REQUEST);

    const emailExists = await User.findOne({ email: newEmail, isDeleted: { $ne: true } });
    if (emailExists) throw new AppError('Email already in use', HTTP_STATUS.BAD_REQUEST);

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.newEmail = newEmail;
    user.emailChangeOtp = otp;
    user.emailChangeOtpExpires = Date.now() + 10 * 60 * 1000;

    await user.save();

    // Send OTP to NEW email address
    console.log(`[OTP] Request started for email: ${newEmail}`);
    console.log(`[OTP] Generated OTP: ${otp}`);
    await emailService.sendEmail(
        newEmail,
        'Email Change Verification Code',
        `Your email change verification code is ${otp}. It expires in 10 minutes.`,
        otp
    );

    return { message: 'OTP sent to new email' };
});

// Verify Email Change
const verifyEmailChange = asyncHandler(async (userId, otp) => {
    const user = await User.findById(userId);
    if (!user) throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);

    if (user.emailChangeOtp !== otp) throw new AppError('Invalid OTP', HTTP_STATUS.BAD_REQUEST);
    if (user.emailChangeOtpExpires < Date.now()) throw new AppError('OTP expired', HTTP_STATUS.BAD_REQUEST);

    // Update Email
    user.email = user.newEmail;
    user.newEmail = undefined;
    user.emailChangeOtp = undefined;
    user.emailChangeOtpExpires = undefined;

    await user.save();
    return { message: 'Email updated successfully', email: user.email };
});

// Add Address
const addAddress = asyncHandler(async (userId, addressData) => {
    const user = await User.findById(userId);
    if (!user) throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);

    if (user.addresses.length >= 5) {
        throw new AppError('Max address limit reached', HTTP_STATUS.BAD_REQUEST);
    }

    // Check Duplicate (Simple check: all fields match)
    const duplicate = user.addresses.some(addr =>
        addr.street === addressData.street &&
        addr.city === addressData.city &&
        addr.zip === addressData.zip
    );

    if (duplicate) {
        throw new AppError('Address already exists', HTTP_STATUS.BAD_REQUEST);
    }

    if (addressData.isDefault) {
        user.addresses.forEach(addr => addr.isDefault = false);
    }

    user.addresses.push(addressData);
    await user.save();
    return user.addresses;
});

// Update Address
const updateAddress = asyncHandler(async (userId, addressId, addressData) => {
    const user = await User.findById(userId);
    if (!user) throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);

    const address = user.addresses.id(addressId);
    if (!address) throw new AppError('Address not found', HTTP_STATUS.NOT_FOUND);

    if (addressData.isDefault) {
        user.addresses.forEach(addr => addr.isDefault = false);
    }

    // Update fields
    // Update fields
    if (addressData.street) address.street = addressData.street;
    if (addressData.city) address.city = addressData.city;
    if (addressData.state) address.state = addressData.state;
    if (addressData.zip) address.zip = addressData.zip;
    if (addressData.country) address.country = addressData.country;
    if (addressData.isDefault !== undefined) address.isDefault = addressData.isDefault;
    if (addressData.name) address.name = addressData.name;
    if (addressData.phone) address.phone = addressData.phone;
    if (addressData.houseNo) address.houseNo = addressData.houseNo;
    if (addressData.label) address.label = addressData.label;


    await user.save();
    return user.addresses;
});

// Delete Address
const deleteAddress = asyncHandler(async (userId, addressId) => {
    const user = await User.findById(userId);
    if (!user) throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);

    const address = user.addresses.id(addressId);
    if (!address) throw new AppError('Address not found', HTTP_STATUS.NOT_FOUND);

    // address.remove(); // Deprecated
    user.addresses.pull(addressId);

    await user.save();
    await user.save();
    return user.addresses;
});

// Delete User Account
const deleteUser = asyncHandler(async (userId) => {
    const user = await User.findById(userId);
    if (!user) throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);

    // Soft delete - mark as deleted, don't remove from database
    user.isDeleted = true;
    await user.save();
    return { message: 'User deleted successfully' };
});

// Request Password Change
const requestPasswordChange = asyncHandler(async (userId, oldPassword, newPassword) => {
    const user = await User.findById(userId);
    if (!user) throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);

    // Verify Old Password
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
        throw new AppError('Incorrect current password', HTTP_STATUS.BAD_REQUEST);
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = otp;
    user.otpExpires = Date.now() + 10 * 60 * 1000; // 10 mins

    await user.save();

    console.log(`[OTP] Request started for email: ${user.email}`);
    console.log(`[OTP] Generated OTP: ${otp}`);
    await emailService.sendEmail(
        user.email,
        'Password Change Verification Code',
        `Your Password Change OTP is ${otp}. It expires in 10 minutes.`,
        otp
    );

    return { message: 'OTP sent to email for password change' };
});

// Verify Password Change
const verifyPasswordChange = asyncHandler(async (userId, otp, newPasswordHash) => {
    const user = await User.findById(userId);
    if (!user) throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);

    if (user.otp !== otp || user.otpExpires < Date.now()) {
        throw new AppError('Invalid or expired OTP', HTTP_STATUS.BAD_REQUEST);
    }

    // Success - update password
    user.password = newPasswordHash;
    user.otp = undefined;
    user.otpExpires = undefined;

    await user.save();
    return { message: 'Password updated successfully' };
});

// Resend Password Change OTP
const resendPasswordChangeOtp = asyncHandler(async (userId) => {
    const user = await User.findById(userId);
    if (!user) throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);

    // Cooldown check (optional but good practice)
    // We reuse lastOtpSentAt if defined, or just rely on expiry window.
    // auth.service uses user.lastOtpSentAt. Profile service doesn't seem to track it yet.
    // For now, simpler implementation:

    // Generate new OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = otp;
    user.otpExpires = Date.now() + 10 * 60 * 1000;

    await user.save();

    console.log(`[OTP] Request started for email: ${user.email}`);
    console.log(`[OTP] Generated OTP: ${otp}`);
    await emailService.sendEmail(
        user.email,
        'Password Change OTP (Resend)',
        `Your Password Change OTP is ${otp}. It expires in 10 minutes.`,
        otp
    );
    return { message: 'OTP resent' };
});

module.exports = {
    getProfile,
    updateProfile,
    requestEmailChange,
    verifyEmailChange,
    addAddress,
    updateAddress,
    deleteAddress,
    deleteUser,
    requestPasswordChange,
    verifyPasswordChange,
    resendPasswordChangeOtp
};
