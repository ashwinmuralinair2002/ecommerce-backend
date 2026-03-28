const express = require('express');
const { ensureAdminAuthenticated } = require('../middleware/admin-auth.middleware');
const adminController = require('../controllers/admin.controller');
const brandController = require('../controllers/admin.brand.controller');
const categoryController = require('../controllers/admin.category.controller');
const productController = require('../controllers/admin.product.controller');
const brandUpload = require('../middleware/brand-upload.middleware');
const categoryUpload = require('../middleware/category-upload.middleware');
const productUpload = require('../middleware/upload.middleware');

const router = express.Router();

router.use(ensureAdminAuthenticated);

router.get('/dashboard', (req, res) => {
    res.render('admin/dashboard');
});

router.get('/offers', adminController.getOffersPage);
router.get('/offers/create', adminController.getCreateOfferPage);
router.get('/offers/:id', adminController.getOfferDetailsPage);
router.get('/offers/:id/edit', adminController.getEditOfferPage);
router.post('/offers/create', adminController.createOffer);
router.patch('/offers/:id', adminController.updateOffer);
router.patch('/offers/:id/toggle', adminController.toggleOffer);
router.delete('/offers/:id', adminController.deleteOffer);

router.get('/customers', adminController.getCustomersPage);
router.get('/customers/add', adminController.renderAddCustomerPage);
router.post('/customers/add', adminController.addCustomer);
router.get('/customers/export', adminController.exportCustomers);
router.get('/customers/:id', adminController.getCustomerDetails);
router.get('/customers/:id/orders', adminController.getCustomerOrders);
router.get('/customers/:id/edit', adminController.renderEditCustomerPage);
router.patch('/customers/:id/update', adminController.updateCustomer);
router.patch('/customers/:id/notes', adminController.updateAdminNotes);
router.patch('/customers/:id/toggle-block', adminController.toggleBlockUser);
router.delete('/customers/:id/delete', adminController.softDeleteUser);
router.post('/customers/:id/delete', adminController.softDeleteUser);
router.patch('/profile/update', adminController.updateAdminProfile);
router.get('/change-password', adminController.getChangePasswordPage);
router.post('/change-password', adminController.changeAdminPassword);

router.get('/brands', brandController.getBrands);
router.get('/brands/add', brandController.renderAddBrand);
router.post('/brands', brandUpload.single('logo'), brandController.addBrand);
router.get('/brands/:id', brandController.getBrandDetails);
router.get('/brands/:id/edit', brandController.renderEditBrand);
router.patch('/brands/:id/edit', brandUpload.single('logo'), brandController.editBrand);
router.patch('/brands/:id/toggle-status', brandController.toggleBrandStatus);
router.post('/brands/:id/delete', brandController.deleteBrand);

router.get('/categories', categoryController.getCategoriesPage);
router.get('/categories/add', categoryController.renderAddCategory);
router.get('/categories/check-name', categoryController.checkCategoryName);
router.post('/categories', categoryUpload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'heroImage', maxCount: 1 }
]), categoryController.addCategory);
router.get('/categories/:id', categoryController.getCategoryDetails);
router.get('/categories/:id/edit', categoryController.renderEditCategory);
router.patch('/categories/:id/edit', categoryUpload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'heroImage', maxCount: 1 }
]), categoryController.editCategory);
router.patch('/categories/:id/block-toggle', categoryController.toggleCategoryBlock);
router.post('/categories/:id/delete', categoryController.deleteCategory);

router.get('/products', productController.getProductsPage);
router.get('/products/add', productController.getAddProductPage);
router.get('/products/edit/:id', productController.getEditProductPage);
router.post('/products', productUpload.any(), productController.createProduct);
router.put('/products/:id', productUpload.any(), productController.updateProduct);
router.delete('/products/:id/images/:imageId', productController.deleteProductImage);
router.post('/products/soft-delete', productController.softDeleteProducts);
router.delete('/products/:id', productController.softDeleteProduct);
router.patch('/products/:id/toggle-list', productController.toggleProductListing);
router.get('/products/:id', productController.getProductDetailPage);

module.exports = router;
