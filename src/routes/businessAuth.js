const express = require('express');
const router = express.Router();
const { signup, login, getMe } = require('../controllers/businessAuthController');
const { protectBusiness } = require('../middleware/businessAuth');

router.post('/signup', signup);
router.post('/login', login);
router.get('/me', protectBusiness, getMe);

module.exports = router;