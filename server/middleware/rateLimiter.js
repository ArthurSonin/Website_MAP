const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 хвилин
  max: 10, // максимум 10 запитів з однієї IP-адреси
  message: {
    status: 429,
    message: 'Забагато спроб входу/реєстрації. Спробуйте пізніше.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { authLimiter };