// Змінні для збереження стану покупок
let userPurchasedApps = [];
let selectedApp = null;
let paymentWindow = null;

// Завантаження покупок з сервера
async function fetchUserPurchases() {
    const token = localStorage.getItem('token');
    if (!token) {
        userPurchasedApps = [];
        return;
    }

    try {
        const response = await fetch('/api/purchases', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            userPurchasedApps = await response.json();
        } else {
            console.error('Помилка завантаження покупок з сервера');
        }
    } catch (error) {
        console.error('Мережева помилка при отриманні покупок:', error);
    }
}

// Відображення унікальних куплених програм у модальному вікні
function renderPurchasedApps() {
    const listContainer = document.getElementById('purchasedAppsList');
    if (!listContainer) return;

    if (userPurchasedApps.length === 0) {
        listContainer.innerHTML = `<p class="empty-apps-text">У вас поки немає придбаних програм.</p>`;
        return;
    }

    // Залишаємо тільки унікальні програми за appId
    const uniqueAppsMap = new Map();
    userPurchasedApps.forEach(app => {
        const id = app.appId || app._id;
        if (!uniqueAppsMap.has(id)) {
            uniqueAppsMap.set(id, app);
        }
    });

    const uniqueApps = Array.from(uniqueAppsMap.values());

    listContainer.innerHTML = uniqueApps.map(app => `
        <div class="purchased-app-item">
            <div class="purchased-app-info">
                <h4>${app.appName || app.name}</h4>
                <p>Версія: ${app.version || 'v1.0.0'}</p>
            </div>
            <a href="${app.fileUrl}" download class="download-btn">
                💾 Завантажити
            </a>
        </div>
    `).join('');
}

function startPaymentCheck(purchaseId, intervalId = null) {
    let attempts = 0;
    const maxAttempts = 30;

    if (intervalId) clearInterval(intervalId);

    console.log(`🚀 Запущено опитування статусу платежу (ID: ${purchaseId})`);

    const timer = setInterval(async () => {
        attempts++;
        console.log(`🔄 Спроба перевірки ${attempts}/${maxAttempts}...`);

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/purchases/check-status/${purchaseId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const data = await res.json();
            console.log('📡 Відповідь сервера:', data);

            if (data.status === 'success') {
                clearInterval(timer);
                console.log('✅ Оплата пройшла успішно!');
                alert('Оплату успішно підтверджено!');
                window.location.reload();
            }
        } catch (err) {
            console.error('❌ Помилка мережі при перевірці статусу:', err);
        }

        if (attempts >= maxAttempts) {
            clearInterval(timer);
            console.log('⏹️ Ліміт спроб перевірки вичерпано.');
        }
    }, 10000);
}

// Основні обробники подій після завантаження сторінки
document.addEventListener('DOMContentLoaded', () => {
    // Безпечний запуск авторизації
    if (typeof Auth !== 'undefined' && Auth.init) {
        Auth.init();
    } else {
        console.error('Об\'єкт Auth не знайдено! Перевірте підключення js/auth.js');
    }

    const buyButtons = document.querySelectorAll('.buy-btn');
    const buyModal = document.getElementById('buyModal');
    const buyAppName = document.getElementById('buyAppName');
    const buyAppPrice = document.getElementById('buyAppPrice');

    // Натискання на кнопку "Придбати"
    buyButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const token = localStorage.getItem('token');
            if (!token) {
                alert('Будь ласка, увійдіть в акаунт для здійснення покупки.');
                if (typeof Auth !== 'undefined') Auth.showModal('login');
                return;
            }

            const appId = e.currentTarget.getAttribute('data-app-id');
            const appName = e.currentTarget.getAttribute('data-app-name');
            const price = e.currentTarget.getAttribute('data-price');
            const version = e.currentTarget.getAttribute('data-version') || 'v1.0.0';
            const fileUrl = e.currentTarget.getAttribute('data-file-url') || `downloads/${appId}.zip`;

            selectedApp = {
                appId: appId,
                appName: appName,
                price: price || 49,
                version: version,
                fileUrl: fileUrl
            };

            if (buyAppName) buyAppName.textContent = appName;
            if (buyAppPrice) buyAppPrice.textContent = price;

            if (buyModal) {
                buyModal.classList.add('active');
                buyModal.style.display = 'flex';
            }
        });
    });

    // При відкритті особистого кабінету — завантажуємо дані з БД і рендеримо
    document.getElementById('profileBtn')?.addEventListener('click', async () => {
        await fetchUserPurchases();
        renderPurchasedApps();
    });

    // Натискання на кнопку "Підтвердити покупку"
    document.getElementById('confirmPurchaseBtn')?.addEventListener('click', async (e) => {
        e.preventDefault();

        const token = localStorage.getItem('token');
        if (!token || !selectedApp) return;

        const btn = e.currentTarget;
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Формуємо рахунок...';

        try {
            const response = await fetch('/api/purchases/create-jar-order', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(selectedApp)
            });

            const data = await response.json();

            if (response.ok && data.jarUrl) {
                if (buyModal) {
                    buyModal.classList.remove('active');
                    buyModal.style.display = 'none';
                }

                // Отримуємо чистий URL у вигляді рядка
                const cleanUrl = typeof data.jarUrl === 'string' ? data.jarUrl : data.jarUrl.href || data.jarUrl;

                // Створюємо елемент посилання з мета-тегами безпеки, щоб захистити від Referer/reCAPTCHA блокувань
                const link = document.createElement('a');
                link.href = cleanUrl;
                link.target = '_blank';
                link.rel = 'noreferrer noopener';
                document.body.appendChild(link);
                
                // Симулюємо чистий клік користувача
                link.click();
                document.body.removeChild(link);

                // Запускаємо перевірку статусу з затримкою
                if (data.purchaseId) {
                    setTimeout(() => {
                        startPaymentCheck(data.purchaseId, null);
                    }, 5000);
                }
            } else {
                alert(data.message || 'Помилка при створенні рахунку.');
            }
        } catch (err) {
            console.error('Помилка з\'єднання:', err);
            alert('Помилка з\'єднання з сервером.');
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    });
});