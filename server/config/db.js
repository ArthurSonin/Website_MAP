const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Успішно підключено до MongoDB');
    } catch (err) {
        console.error('Помилка підключення до MongoDB:', err);
        process.exit(1);
    }
};

module.exports = connectDB;