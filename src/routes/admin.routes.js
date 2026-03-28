// Admin API routes
const express = require('express');
const { ensureAdminAuthenticated } = require('../middleware/admin-auth.middleware');
const adminController = require('../controllers/admin.controller');

const router = express.Router();

router.use(ensureAdminAuthenticated);

router.get('/offers', adminController.getOffersPage);
router.get('/offers/create', adminController.getCreateOfferPage);
router.get('/offers/:id', adminController.getOfferDetailsPage);
router.get('/offers/:id/edit', adminController.getEditOfferPage);
router.post('/offers/create', adminController.createOffer);
router.patch('/offers/:id', adminController.updateOffer);
router.patch('/offers/:id/toggle', adminController.toggleOffer);
router.delete('/offers/:id', adminController.deleteOffer);

module.exports = router;
