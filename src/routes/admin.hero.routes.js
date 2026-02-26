const express = require('express');
const { ensureAdminAuthenticated } = require('../middleware/admin-auth.middleware');
const heroUpload = require('../middleware/hero-upload.middleware');
const heroController = require('../controllers/admin.hero.controller');

const router = express.Router();

router.use('/admin', ensureAdminAuthenticated);

router.get('/admin/heroes', heroController.getAllHeroes);
router.get('/admin/heroes/add', heroController.getAddHero);
router.post('/admin/heroes', heroUpload.single('image'), heroController.createHero);
router.get('/admin/heroes/:id/edit', heroController.getEditHero);
router.patch('/admin/heroes/:id', heroUpload.single('image'), heroController.updateHero);
router.patch('/admin/heroes/:id/toggle', heroController.toggleHeroStatus);
router.delete('/admin/heroes/:id', heroController.deleteHero);

module.exports = router;
