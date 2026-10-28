const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: process.env.SMTP_EMAIL,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  try {
    // Спочатку перевіряємо правильність SMTP_EMAIL та SMTP_PASSWORD у .env
    await transporter.verify();
  } catch (authError) {
    console.error('Помилка авторизації SMTP:', authError);
    if (authError.code === 'EAUTH' || authError.responseCode === 535) {
      throw new Error('Помилка конфігурації сервера: невірний логін або пароль додатка SMTP у .env');
    }
    throw new Error(`Не вдалося з'єднатися з поштовим сервером: ${authError.message}`);
  }

  const message = {
    from: `MySoftware <${process.env.SMTP_EMAIL}>`,
    to: options.email,
    subject: options.subject,
    text: options.message,
  };

  try {
    await transporter.sendMail(message);
  } catch (sendError) {
    console.error('Помилка надсилання листа:', sendError);
    if (sendError.responseCode === 550 || sendError.code === 'EENVELOPE') {
      throw new Error('Вказана електронна адреса отримувача не існує або недоступна');
    }
    throw new Error(`Помилка під час відправки листа: ${sendError.message}`);
  }
};

module.exports = sendEmail;