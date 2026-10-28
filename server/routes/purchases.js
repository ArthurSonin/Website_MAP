const express = require('express');
const router = express.Router();
const Purchase = require('../models/Purchase');
const jwt = require('jsonwebtoken');
const axios = require('axios');

// Змінні для кешування транзакцій Monobank
let cachedTransactions = [];
let lastFetchTime = 0;

// Middleware для перевірки JWT-токена
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Токен відсутній' });
    }

    jwt.verify(token, process.env.JWT_SECRET || 'secret_key', (err, user) => {
        if (err) {
            return res.status(403).json({ message: 'Недійсний токен' });
        }
        req.user = user;
        next();
    });
};

// GET /api/purchases — отримати ТІЛЬКИ успішно куплені програми
router.get('/', authenticateToken, async (req, res) => {
    try {
        const purchases = await Purchase.find({ 
            userId: req.user.id, 
            status: 'success' 
        });
        res.json(purchases);
    } catch (err) {
        res.status(500).json({ message: 'Помилка при отриманні покупок' });
    }
});

// POST /api/purchases/create-jar-order
router.post('/create-jar-order', authenticateToken, async (req, res) => {
    try {
        const { appId, appName, price, version, fileUrl } = req.body;
        const currentPrice = Number(price) || 49;

        // 1. Шукаємо незавершений замовлення цієї програми у цього користувача
        let purchase = await Purchase.findOne({
            userId: req.user.id,
            appId: appId || 'minty-app',
            status: 'pending'
        });

        if (purchase) {
            // Якщо є — оновлюємо ціну, дату та обов'язкові поля
            purchase.price = currentPrice;
            purchase.appName = appName || purchase.appName || 'Minty App';
            purchase.fileUrl = fileUrl || purchase.fileUrl || 'downloads/minty-setup.zip';
            purchase.createdAt = new Date();
            await purchase.save();
        } else {
            // Якщо немає — створюємо новий запис
            purchase = new Purchase({
                userId: req.user.id,
                appId: appId || 'minty-app',
                appName: appName || 'Minty App',
                version: version || 'v0.4',
                fileUrl: fileUrl || 'downloads/minty-setup.zip',
                price: currentPrice,
                status: 'pending'
            });
            await purchase.save();
        }

        const jarCode = (process.env.MONO_JAR_CODE || process.env.MONO_JAR_ID || '').trim();
        const shortComment = purchase._id.toString().slice(-6);

        const jarUrl = `https://send.monobank.ua/jar/${jarCode}?a=${Math.round(currentPrice)}&t=${encodeURIComponent(shortComment)}`;

        console.log('🔗 Згенероване посилання (строка):', jarUrl);

        // Відправляємо чисту рядок jarUrl
        res.json({ 
            jarUrl: jarUrl, 
            purchaseId: purchase._id 
        });
    } catch (err) {
        console.error('Помилка створення замовлення:', err.message);
        res.status(500).json({ message: 'Помилка при створенні замовлення: ' + err.message });
    }
});

// GET /api/purchases/check-status/:purchaseId
router.get('/check-status/:purchaseId', authenticateToken, async (req, res) => {
    try {
        console.log(`\n🔍 [Опитування] Перевіряємо статус для покупки ID: ${req.params.purchaseId}`);

        const purchase = await Purchase.findById(req.params.purchaseId);
        
        if (!purchase) {
            console.log('❌ Замовлення не знайдено в БД');
            return res.status(404).json({ message: 'Замовлення не знайдено' });
        }

        if (purchase.status === 'success') {
            console.log('✅ Покупка вже має статус success');
            return res.json({ status: 'success', message: 'Оплачено' });
        }

        const now = Math.floor(Date.now() / 1000);

        if (now - lastFetchTime > 15 || cachedTransactions.length === 0) {
            try {
                const dayAgo = now - 3600;

                const monoRes = await axios.get(
                    `https://api.monobank.ua/personal/statement/${process.env.MONO_JAR_ID}/${dayAgo}`,
                    {
                        headers: { 'X-Token': process.env.MONO_API_TOKEN }
                    }
                );

                if (Array.isArray(monoRes.data)) {
                    cachedTransactions = monoRes.data;
                    lastFetchTime = now;
                    console.log(`📥 Оновлено кеш: отримано ${cachedTransactions.length} транзакцій з Monobank`);
                    
                    // ВИВЕДЕННЯ ТРАНЗАКЦІЙ ДЛЯ ДІАГНОСТИКИ (виведе всі поля отриманих транзакцій)
                    console.log('--- СТРУКТУРА ОТРИМАНИХ ТРАНЗАКЦІЙ ---');
                    console.dir(cachedTransactions, { depth: null, colors: true });
                    console.log('------------------------------------');
                }
            } catch (monoErr) {
                if (monoErr.response && monoErr.response.status === 429) {
                    console.warn('⚠️ Rate Limit (429): Використовуємо кешовану виписку.');
                } else {
                    console.error('❌ Помилка Monobank API:', monoErr.response?.data || monoErr.message);
                }
            }
        } else {
            console.log(`Використовуємо кешовану виписку (${cachedTransactions.length} транзакцій)`);
        }

        // Приводимо шуканий коментар до нижнього регістру
        const shortComment = purchase._id.toString().slice(-6).toLowerCase();
        const expectedAmountInCents = Math.round((purchase.price || 49) * 100);

        // Перевіряємо абсолютно ВСІ текстові поля об'єкта транзакції
        const isPaid = Array.isArray(cachedTransactions) && cachedTransactions.some(tx => {
            // Перетворюємо весь об'єкт транзакції на один великий рядок у нижньому регістрі
            const fullTxString = JSON.stringify(tx).toLowerCase();
            
            const hasComment = fullTxString.includes(shortComment);
            const hasCorrectAmount = Math.abs(tx.amount) >= expectedAmountInCents;

            if (hasComment) {
                console.log(`🎯 Знайдено співпадіння! Текст: "${shortComment}", Сума: ${tx.amount} (Очікувалось: ${expectedAmountInCents})`);
            } 

            return hasComment && hasCorrectAmount;
        });

        if (isPaid) {
            purchase.status = 'success';
            await purchase.save();
            console.log(`🎉 ПОКУПКУ ${purchase._id} ЗНАЙДЕНО ТА ПІДТВЕРДЖЕНО!`);
            return res.json({ status: 'success', message: 'Оплату підтверджено!' });
        }

        console.log(`⏳ Транзакцію з коментарем "${shortComment}" поки не знайдено (Pending)`);
        res.json({ status: 'pending', message: 'Очікуємо зарахування коштів' });
    } catch (err) {
        console.error('❌ Помилка перевірки покупки:', err.message);
        res.status(500).json({ message: 'Помилка перевірки платежу' });
    }
});

module.exports = router;