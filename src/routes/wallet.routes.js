const express = require('express');
const walletController = require('../controllers/wallet.controller');

const router = express.Router();

router.get('/', walletController.getWalletPage);
router.get('/transactions', walletController.getTransactions);
router.post('/create-recharge-order', walletController.createRechargeOrder);
router.post('/verify-recharge', walletController.verifyRecharge);
router.post('/recharge', walletController.rechargeWallet);

module.exports = router;
