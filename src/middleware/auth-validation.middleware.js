const { check } = require('express-validator');

const signupValidation = [
    check('name', 'Name is required').not().isEmpty(),
    check('email', 'Please include a valid email').isEmail(),
    check('password', 'Password must be at least 6 characters').isLength({ min: 6 }),
];

const forgotPasswordValidation = [
    check('email', 'Please include a valid email').isEmail()
];

module.exports = {
    signupValidation,
    forgotPasswordValidation
};
