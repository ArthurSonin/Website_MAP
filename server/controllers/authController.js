const crypto = require('crypto');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const sendEmail = require('../utils/sendEmail');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'secret123', {
    expiresIn: '30d',
  });
};

// @desc    Реєстрація та надсилання 6-значного коду
// @route   POST /api/auth/register
exports.register = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Заповніть усі поля' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      if (existingUser.isVerified) {
        return res.status(400).json({ message: 'Користувач із цим email вже існує' });
      }

      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
      existingUser.verificationCodeHash = crypto
        .createHash('sha256')
        .update(verificationCode)
        .digest('hex');
      existingUser.verificationCodeExpires = Date.now() + 10 * 60 * 1000;
      await existingUser.save();

      await sendEmail({
        email: existingUser.email,
        subject: 'Новий код підтвердження',
        message: `Ваш новий код: ${verificationCode}`
      });

      return res.status(200).json({ message: 'Код підтвердження надіслано повторно' });
    }

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationCodeHash = crypto
      .createHash('sha256')
      .update(verificationCode)
      .digest('hex');
    const verificationCodeExpires = Date.now() + 10 * 60 * 1000;

    const user = await User.create({
      username,
      email,
      password,
      verificationCodeHash,
      verificationCodeExpires
    });

    await sendEmail({
      email: user.email,
      subject: 'Код підтвердження',
      message: `Ваш код: ${verificationCode}`
    });

    return res.status(201).json({ success: true, message: 'Код відправлено на ваш email' });
  } catch (error) {
    return res.status(500).json({ message: 'Помилка сервера' });
  }
};

// @desc    Підтвердження електронної пошти за кодом
// @route   POST /api/auth/verify-code
exports.verifyCode = async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ message: 'Вкажіть email та код підтвердження' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Користувача не знайдено' });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: 'Ваша пошта вже підтверджена' });
    }

    // Хешуємо введений користувачем код для порівняння з базою
    const hashedCodeInput = crypto.createHash('sha256').update(code.toString().trim()).digest('hex');

    // Перевірка переносу часу або невірного коду
    if (
      user.verificationCodeHash !== hashedCodeInput ||
      user.verificationCodeExpires < Date.now()
    ) {
      return res.status(400).json({ message: 'Недійсний або застарілий код підтвердження' });
    }

    // Успішна верифікація — очищаємо тимчасові поля
    user.isVerified = true;
    user.verificationCodeHash = undefined;
    user.verificationCodeExpires = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Email успішно підтверджено! Тепер ви можете увійти.'
    });

  } catch (error) {
    res.status(500).json({ message: 'Помилка сервера', error: error.message });
  }
};

// @desc    Авторизація (Вхід)
// @route   POST /api/auth/login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Заповніть усі поля' });
    }

    const user = await User.findOne({ email });

    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ message: 'Невірний email або пароль' });
    }

    if (!user.isVerified) {
      return res.status(403).json({ 
        message: 'Пошта не підтверджена. Введіть код підтвердження, надісланий на вашу пошту.' 
      });
    }

    res.json({
      success: true,
      token: generateToken(user._id),
      data: {
        id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar || ''
      }
    });

  } catch (error) {
    res.status(500).json({ message: 'Помилка сервера', error: error.message });
  }
};

exports.updateAvatar = async (req, res) => {
  try {
    const { email, avatar } = req.body;

    if (!email || !avatar) {
      return res.status(400).json({ message: 'Email та avatar обов`язкові' });
    }

    const user = await User.findOneAndUpdate(
      { email },
      { avatar },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: 'Користувача не знайдено' });
    }

    return res.json({ success: true, avatar: user.avatar });
  } catch (error) {
    return res.status(500).json({ message: 'Помилка збереження аватарки' });
  }
};

exports.updateUsername = async (req, res) => {
  try {
    const { email, username } = req.body;

    if (!email || !username) {
      return res.status(400).json({ message: 'Email и имя обязательны' });
    }

    const user = await User.findOneAndUpdate(
      { email },
      { username },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    res.json({
      success: true,
      message: 'Имя успешно обновлено',
      user: {
        username: user.username,
        email: user.email,
        avatar: user.avatar
      }
    });
  } catch (error) {
    console.error('Ошибка при обновлении имени:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};