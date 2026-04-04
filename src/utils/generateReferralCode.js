const generateReferralCode = (user) => {
    return user._id.toString().slice(-8).toUpperCase();
};

module.exports = generateReferralCode;
