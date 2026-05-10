const express = require('express');
const { ensureAdminAuthenticated } = require('../middleware/admin-auth.middleware');
const heroUpload = require('../middleware/hero-upload.middleware');
const heroController = require('../controllers/admin.hero.controller');

const router = express.Router();

router.use(ensureAdminAuthenticated);

router.get('/heroes', heroController.getAllHeroes);
router.get('/heroes/add', heroController.getAddHero);
router.post('/heroes', heroUpload.fields(), heroController.createHero);
router.get('/heroes/:id', heroController.getEditHero);
router.get('/heroes/:id/edit', heroController.getEditHero);
router.patch('/heroes/:id', heroUpload.fields(), heroController.updateHero);
router.patch('/heroes/:id/mobile-image/remove', heroController.removeHeroMobileImage);
router.patch('/heroes/:id/toggle', heroController.toggleHeroStatus);
router.delete('/heroes/:id', heroController.deleteHero);

module.exports = router;
