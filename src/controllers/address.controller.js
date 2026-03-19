// Address management controller for user account
const User = require('../models/user.model');
const profileService = require('../services/profile.service');

const getReturnPath = (req) => {
    const returnTo = req.body.returnTo || req.query.returnTo;
    return returnTo === 'cart' ? '/cart' : '/account/addresses';
};

// @desc    Render Address List Page
// @route   GET /account/addresses
const getAddresses = async (req, res) => {
    const userId = req.session && req.session.userId;
    if (!userId) {
        return res.redirect('/login');
    }

    try {
        const user = await User.findById(userId).select('name addresses').lean();
        const currentPage = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = 3;
        const allAddresses = (user && user.addresses) ? user.addresses : [];
        const totalAddresses = allAddresses.length;
        const totalPages = Math.max(Math.ceil(totalAddresses / limit), 1);
        const safeCurrentPage = Math.min(currentPage, totalPages);
        const startIndex = (safeCurrentPage - 1) * limit;
        const slicedAddresses = allAddresses.slice(startIndex, startIndex + limit);

        const pagination = {
            currentPage: safeCurrentPage,
            totalPages,
            totalAddresses,
            hasPrevPage: safeCurrentPage > 1,
            hasNextPage: safeCurrentPage < totalPages
        };

        res.render('user-addresses', {
            user: user || {},
            addresses: slicedAddresses,
            pagination
        });
    } catch (error) {
        res.render('user-addresses', {
            user: {},
            addresses: [],
            pagination: {
                currentPage: 1,
                totalPages: 1,
                totalAddresses: 0,
                hasPrevPage: false,
                hasNextPage: false
            }
        });
    }
};

// @desc    Render Add Address Form
// @route   GET /account/addresses/new
const renderAddAddress = (req, res) => {
    res.render('add-address', { user: req.user || {}, returnTo: req.query.returnTo || '' });
};

// @desc    Add New Address
// @route   POST /account/addresses
const addAddress = async (req, res) => {
    const userId = req.session && req.session.userId;
    if (!userId) {
        return res.redirect('/login');
    }

    const { name, phone, houseNo, street, city, state, postalCode, label, isDefault } = req.body;
    const errors = {};

    if (!name || !/^[A-Za-z ]{3,}$/.test(name.trim())) {
        errors.name = 'Name must be at least 3 characters and contain only alphabets.';
    }
    if (!phone || !/^[0-9]{10}$/.test(phone.trim())) {
        errors.phone = 'Phone number must be exactly 10 digits.';
    }
    if (!postalCode || !/^[0-9]{6}$/.test(postalCode.trim())) {
        errors.postalCode = 'Postal code must be exactly 6 digits.';
    }
    if (!houseNo || houseNo.trim().length < 1) errors.houseNo = 'House No is required.';
    if (!street || street.trim().length < 2) errors.street = 'Street is required (min 2 chars).';
    if (!city || city.trim().length < 2) {
        errors.city = 'City is required (min 2 chars).';
    } else if (!/^[A-Za-z]+(?:\s[A-Za-z]+)*$/.test(city.trim())) {
        errors.city = 'City must contain only letters and spaces.';
    }
    if (!state || state.trim().length < 2) {
        errors.state = 'State is required (min 2 chars).';
    } else if (!/^[A-Za-z]+(?:\s[A-Za-z]+)*$/.test(state.trim())) {
        errors.state = 'State must contain only letters and spaces.';
    }
    if (!label) errors.label = 'Label is required.';

    if (Object.keys(errors).length > 0) {
        return res.render('add-address', {
            user: req.user || {},
            errors,
            formData: req.body,
            returnTo: req.body.returnTo || ''
        });
    }

    try {
        // Title-case helper
        const toTitleCase = (s) => s.trim().replace(/\s+/g, ' ').replace(/\b[a-z]/g, c => c.toUpperCase());

        const addressData = {
            street: `${houseNo}, ${street}`,
            city: toTitleCase(city),
            state: toTitleCase(state),
            zip: postalCode,
            country: 'India',
            isDefault: isDefault === 'Yes',
            name,
            phone,
            label,
            houseNo,
            originalStreet: street
        };

        await profileService.addAddress(userId, addressData);
        res.redirect(getReturnPath(req));
    } catch (error) {
        res.status(500).render('add-address', {
            user: req.user || {},
            errors: { general: 'Failed to save address. Please try again.' },
            formData: req.body,
            returnTo: req.body.returnTo || ''
        });
    }
};

// @desc    Render Edit Address Form
// @route   GET /account/addresses/:id/edit
const renderEditAddress = async (req, res) => {
    const userId = req.session && req.session.userId;
    if (!userId) {
        return res.redirect('/login');
    }

    const user = await User.findById(userId).select('name addresses');
    if (!user) {
        return res.redirect('/account/addresses');
    }

    const address = user.addresses.id(req.params.id);
    if (!address) {
        return res.redirect('/account/addresses');
    }
    res.render('edit-address', { user, address, returnTo: req.query.returnTo || '' });
};

// @desc    Update Address
// @route   POST /account/addresses/:id/update
const updateAddress = async (req, res) => {
    const userId = req.session && req.session.userId;
    if (!userId) {
        return res.redirect('/login');
    }

    const { name, phone, houseNo, street, city, state, postalCode, label, isDefault } = req.body;
    const errors = {};

    if (!name || !/^[A-Za-z ]{3,}$/.test(name.trim())) {
        errors.name = 'Name must be at least 3 characters and contain only alphabets.';
    }
    if (!phone || !/^[0-9]{10}$/.test(phone.trim())) {
        errors.phone = 'Phone number must be exactly 10 digits.';
    }
    if (!postalCode || !/^[0-9]{6}$/.test(postalCode.trim())) {
        errors.postalCode = 'Postal code must be exactly 6 digits.';
    }
    if (!houseNo || houseNo.trim().length < 1) errors.houseNo = 'House No is required.';
    if (!street || street.trim().length < 2) errors.street = 'Street is required (min 2 chars).';
    if (!city || city.trim().length < 2) {
        errors.city = 'City is required (min 2 chars).';
    } else if (!/^[A-Za-z]+(?:\s[A-Za-z]+)*$/.test(city.trim())) {
        errors.city = 'City must contain only letters and spaces.';
    }
    if (!state || state.trim().length < 2) {
        errors.state = 'State is required (min 2 chars).';
    } else if (!/^[A-Za-z]+(?:\s[A-Za-z]+)*$/.test(state.trim())) {
        errors.state = 'State must contain only letters and spaces.';
    }
    if (!label) errors.label = 'Label is required.';

    if (Object.keys(errors).length > 0) {
        const mockAddress = { _id: req.params.id, ...req.body, zip: postalCode };
        return res.render('edit-address', {
            user: req.user || {},
            address: mockAddress,
            errors,
            formData: req.body,
            returnTo: req.body.returnTo || ''
        });
    }

    try {
        // Title-case helper
        const toTitleCase = (s) => s.trim().replace(/\s+/g, ' ').replace(/\b[a-z]/g, c => c.toUpperCase());

        const addressData = {
            name,
            phone,
            houseNo,
            street,
            city: toTitleCase(city),
            state: toTitleCase(state),
            zip: postalCode,
            country: 'India',
            label,
            isDefault: isDefault === 'on'
        };

        await profileService.updateAddress(userId, req.params.id, addressData);
        res.redirect(getReturnPath(req));
    } catch (error) {
        const mockAddress = { _id: req.params.id, ...req.body, zip: postalCode };
        res.status(500).render('edit-address', {
            user: req.user || {},
            address: mockAddress,
            errors: { general: 'Failed to update address. Please try again.' },
            formData: req.body,
            returnTo: req.body.returnTo || ''
        });
    }
};

// @desc    Delete Address
// @route   POST /account/addresses/:id/delete
const deleteAddress = async (req, res) => {
    const userId = req.session && req.session.userId;
    if (!userId) {
        return res.redirect('/login');
    }

    try {
        await profileService.deleteAddress(userId, req.params.id);
        res.redirect('/account/addresses');
    } catch (error) {
        res.redirect('/account/addresses?error=delete_failed');
    }
};

module.exports = {
    getAddresses,
    renderAddAddress,
    addAddress,
    renderEditAddress,
    updateAddress,
    deleteAddress
};
