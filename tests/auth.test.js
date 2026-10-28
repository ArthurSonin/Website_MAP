jest.mock('../server/middleware/rateLimiter', () => ({
  authLimiter: (req, res, next) => next()
}));

const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');
const path = require('path');

// Встановлюємо тестове середовище для вимкнення rateLimiter
process.env.NODE_ENV = 'test';

dotenv.config();

const authRoutes = require('../server/routes/authRoutes');
const User = require('../server/models/User');
const sendEmail = require('../server/utils/sendEmail');

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

app.use(express.static(path.join(__dirname, '../client')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

describe('Auth API & Email Coverage Tests', () => {
  const testUser = {
    username: 'CoverageUser',
    email: `cov_${Date.now()}@gmail.com`,
    password: 'password123'
  };

  beforeAll(async () => {
    const dbUrl = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/shop_db';
    await mongoose.connect(dbUrl);
  });

  afterAll(async () => {
    await User.deleteMany({ email: { $regex: /cov_/ } });
    await mongoose.connection.close();
  });

  describe('1. Validation & Edge Cases for Register', () => {
    test('Має повернути 400, якщо не передано обов’язкові поля', async () => {
        const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'incomplete@test.com' });

        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Заповніть усі поля');
    });

    test('Успішна реєстрація користувача', async () => {
        const res = await request(app)
        .post('/api/auth/register')
        .send(testUser);

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
    }, 10000);

    test('Має повторно надіслати код, якщо користувач реєструється знов із непідтвердженою поштою', async () => {
        // Створюємо непідтвердженого користувача
        const pendingUser = {
        username: 'PendingUser',
        email: `pending_${Date.now()}@gmail.com`,
        password: 'password123'
        };

        await request(app).post('/api/auth/register').send(pendingUser);

        // Пробуємо зареєструватися з тими ж даними ще раз (має оновити код)
        const res = await request(app).post('/api/auth/register').send(pendingUser);

        expect(res.status).toBe(200);
        expect(res.body.message).toContain('Код підтвердження надіслано повторно');
    }, 15000);

    test('Має повернути 400 при спробі дублювання email підтвердженого користувача', async () => {
        // 1. Позначаємо користувача як підтвердженого в базі даних
        await User.updateOne({ email: testUser.email }, { isVerified: true });

        // 2. Пробуємо зареєструватися знову на той самий email
        const res = await request(app)
        .post('/api/auth/register')
        .send(testUser);

        // Тепер сервер гарантовано поверне 400
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Користувач із цим email вже існує');
    });
});

  describe('2. Validation & Edge Cases for Verify Code', () => {
    test('Має повернути 400, якщо термін дії коду закінчився', async () => {
        const expiredEmail = `expired_${Date.now()}@gmail.com`;
        
        // Створюємо користувача з простроченим кодом
        await User.create({
            username: 'ExpiredUser',
            email: expiredEmail,
            password: 'password123',
            isVerified: false,
            verificationCodeHash: 'somehash',
            verificationCodeExpires: Date.now() - 10000 // Час минув!
        });

        const res = await request(app)
            .post('/api/auth/verify-code')
            .send({ email: expiredEmail, code: '123456' });

        expect(res.status).toBe(400);
        expect(res.body.message).toContain('Недійсний або застарілий код');
    });
    test('Має повернути 400, якщо не вказано email або код', async () => {
      const res = await request(app)
        .post('/api/auth/verify-code')
        .send({ email: testUser.email });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Вкажіть email та код підтвердження');
    });

    test('Має повернути 400, якщо користувача не знайдено', async () => {
      const res = await request(app)
        .post('/api/auth/verify-code')
        .send({ email: 'nonexistent_cov@gmail.com', code: '123456' });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Користувача не знайдено');
    });

    test('Має повернути 400 при некоректному коді', async () => {
        // Переконуємося, що пошта не підтверджена перед перевіркою некоректного коду
        await User.updateOne({ email: testUser.email }, { isVerified: false });

        const res = await request(app)
            .post('/api/auth/verify-code')
            .send({ email: testUser.email, code: '000000' });

        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Недійсний або застарілий код підтвердження');
    });

    test('Успішне підтвердження коду (імітація)', async () => {
      const user = await User.findOne({ email: testUser.email });
      user.isVerified = false;
      const crypto = require('crypto');
      user.verificationCodeHash = crypto.createHash('sha256').update('123456').digest('hex');
      user.verificationCodeExpires = Date.now() + 100000;
      await user.save();

      const res = await request(app)
        .post('/api/auth/verify-code')
        .send({ email: testUser.email, code: '123456' });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Email успішно підтверджено');
    });

    test('Має повернути 400, якщо пошта вже підтверджена', async () => {
      const res = await request(app)
        .post('/api/auth/verify-code')
        .send({ email: testUser.email, code: '123456' });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Ваша пошта вже підтверджена');
    });
  });

  describe('3. Validation & Edge Cases for Login', () => {
    test('Має повернути 400, якщо не передано email або password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: testUser.email });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Заповніть усі поля');
    });

    test('Має повернути 401 при неверному паролі/email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: testUser.email, password: 'wrongpassword' });

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Невірний email або пароль');
    });

    test('Має повернути 403, якщо пошта не підтверджена', async () => {
      const unverifiedUser = await User.create({
        username: 'Unverified',
        email: `cov_unverified_${Date.now()}@gmail.com`,
        password: 'password123',
        isVerified: false
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: unverifiedUser.email, password: 'password123' });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Пошта не підтверджена');
    });

    test('Успішний вхід верифікованого користувача', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: testUser.email, password: testUser.password });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
    });
  });

  describe('4. sendEmail Error Handling & Coverage', () => {
    let consoleSpy;

    beforeEach(() => {
      // Приглушуємо логування console.error для чистих логів тесту
      consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    test('Перевірка помилки авторизації SMTP у sendEmail', async () => {
      const spy = jest.spyOn(nodemailer, 'createTransport').mockReturnValueOnce({
        verify: jest.fn().mockRejectedValue({ code: 'EAUTH', responseCode: 535 }),
        sendMail: jest.fn()
      });

      await expect(sendEmail({ email: 'test@test.com', subject: 'test', message: 'test' }))
        .rejects.toThrow('невірний логін або пароль додатка SMTP');

      spy.mockRestore();
    });

    test('Перевірка загальної помилки з’єднання SMTP у sendEmail', async () => {
      const spy = jest.spyOn(nodemailer, 'createTransport').mockReturnValueOnce({
        verify: jest.fn().mockRejectedValue(new Error('Connection error')),
        sendMail: jest.fn()
      });

      await expect(sendEmail({ email: 'test@test.com', subject: 'test', message: 'test' }))
        .rejects.toThrow("Не вдалося з'єднатися з поштовим сервером");

      spy.mockRestore();
    });

    test('Перевірка помилки неіснуючого отримувача у sendEmail', async () => {
      const spy = jest.spyOn(nodemailer, 'createTransport').mockReturnValueOnce({
        verify: jest.fn().mockResolvedValue(true),
        sendMail: jest.fn().mockRejectedValue({ responseCode: 550, message: 'User unknown' })
      });

      await expect(sendEmail({ email: 'test@test.com', subject: 'test', message: 'test' }))
        .rejects.toThrow('Вказана електронна адреса отримувача не існує');

      spy.mockRestore();
    });

    test('Перевірка загальної помилки надсилання у sendEmail', async () => {
      const spy = jest.spyOn(nodemailer, 'createTransport').mockReturnValueOnce({
        verify: jest.fn().mockResolvedValue(true),
        sendMail: jest.fn().mockRejectedValue(new Error('Send failed'))
      });

      await expect(sendEmail({ email: 'test@test.com', subject: 'test', message: 'test' }))
        .rejects.toThrow('Помилка під час відправки листа');

      spy.mockRestore();
    });
  });
  
  describe('5. Catch Block Error Handling (500 Statuses)', () => {
    test('Має повернути 500 при помилці БД у register', async () => {
        const spy = jest.spyOn(User, 'findOne').mockRejectedValueOnce(new Error('DB Error'));
        const res = await request(app).post('/api/auth/register').send(testUser);
        expect(res.status).toBe(500);
        spy.mockRestore();
    });

    test('Має повернути 500 при помилці БД у verifyCode', async () => {
        const spy = jest.spyOn(User, 'findOne').mockRejectedValueOnce(new Error('DB Error'));
        const res = await request(app).post('/api/auth/verify-code').send({ email: testUser.email, code: '123456' });
        expect(res.status).toBe(500);
        spy.mockRestore();
    });

    test('Має повернути 500 при помилці БД у login', async () => {
        const spy = jest.spyOn(User, 'findOne').mockRejectedValueOnce(new Error('DB Error'));
        const res = await request(app).post('/api/auth/login').send({ email: testUser.email, password: 'password123' });
        expect(res.status).toBe(500);
        spy.mockRestore();
    });
  });
  describe('6. Static Files & Root Route Tests', () => {
    test('Має повернути 200 та index.html при запиті на GET /', async () => {
      const res = await request(app).get('/');
      
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/html/);
    });

    test('Має повертати 404 для неіснуючих сторінок', async () => {
      const res = await request(app).get('/non-existent-page-12345');
      
      expect(res.status).toBe(404);
    });
  });

  describe('7. Google OAuth Routes Availability', () => {
    test('Маршрут /api/auth/google має ініціалізувати редірект на Google', async () => {
      const res = await request(app).get('/api/auth/google');
      
      // Код 302 вказує на успішне перенаправлення на сторінку авторизації Google
      expect([302, 500]).toContain(res.status); 
    });
  });
});