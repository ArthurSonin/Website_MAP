const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken'); // Імпортуємо jsonwebtoken
const { register, login, verifyCode, updateAvatar, updateUsername} = require('../controllers/authController');
const { authLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/verify-code', authLimiter, verifyCode);
router.put('/avatar', updateAvatar); // Оновлення аватарки
router.put('/update-username', updateUsername); // Оновлення імені

// Початок авторизації через Google
router.get('/google', passport.authenticate('google', { 
  scope: ['profile', 'email'],
  prompt: 'select_account'
}));

// Callback маршрут
router.get('/google/callback', 
  passport.authenticate('google', { session: false, failureRedirect: '/' }),
  (req, res) => {
    const token = jwt.sign(
      { id: req.user._id || req.user.id, email: req.user.email },
      process.env.JWT_SECRET || 'secret_key',
      { expiresIn: '7d' }
    );

    const name = encodeURIComponent(req.user.username || req.user.displayName || '');
    const email = encodeURIComponent(req.user.email || req.user.emails?.[0]?.value || '');
    const avatar = encodeURIComponent(req.user.avatar || req.user.photos?.[0]?.value || '');

    res.redirect(`http://localhost:5000/?token=${token}&name=${name}&email=${email}&avatar=${avatar}`);
  }
);

module.exports = router;