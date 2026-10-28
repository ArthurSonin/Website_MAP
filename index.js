const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const passport = require('passport');
const path = require('path');
const connectDB = require('./server/config/db');
const purchasesRouter = require('./server/routes/purchases');

dotenv.config();

require('./server/config/passport');

// Підключаємо БД тільки якщо це не тести
if (process.env.NODE_ENV !== 'test') {
  connectDB();
}

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(passport.initialize());

// Роздаємо статику з папки client
app.use(express.static(path.join(__dirname, 'client')));

// Маршрути API
app.use('/api/auth', require('./server/routes/authRoutes'));
app.use('/api/purchases', purchasesRouter);

// Головний маршрут віддає index.html із client/
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'client', 'index.html'));
});

// Запускаємо listener ТІЛЬКИ якщо файл викликано напряму, а не імпортовано в Jest
if (process.env.NODE_ENV !== 'test') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Сервер запущено на порту ${PORT}`);
  });
}

// Експортуємо app для тесті за допомогою Supertest
module.exports = app;