const Auth = {
  init() {
    this.authButtons = document.getElementById('authButtons');
    this.userProfile = document.getElementById('userProfile');
    this.userName = document.getElementById('userName');
    this.userAvatar = document.getElementById('userAvatar');
    
    this.authModal = document.getElementById('authModal');
    this.loginForm = document.getElementById('loginForm');
    this.registerForm = document.getElementById('registerForm');
    this.verifyForm = document.getElementById('verifyForm');

    this.profileModal = document.getElementById('profileModal');
    this.profileBtn = document.getElementById('profileBtn');

    this.tempEmail = '';

    this.checkOAuthRedirect();
    this.updateUI();
    this.bindEvents();
  },

  getDefaultAvatar(username) {
    return 'https://ui-avatars.com/api/?name=' + encodeURIComponent(username || 'User') + '&background=random';
  },

  checkOAuthRedirect() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const name = params.get('name');
    const email = params.get('email');
    const avatar = params.get('avatar');

    if (token) {
      localStorage.setItem('token', token);

      const userData = {
        username: name || email || 'Користувач',
        email: email || '',
        avatar: avatar || ''
      };
      localStorage.setItem('user', JSON.stringify(userData));

      window.history.replaceState({}, document.title, window.location.pathname);
      this.updateUI();
    }
  },

  updateUI() {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');

    let user = null;
    if (userStr && userStr !== 'undefined') {
      try {
        user = JSON.parse(userStr);
      } catch (e) {
        console.error('Помилка зчитування user з localStorage:', e);
        localStorage.removeItem('user');
      }
    }

    const authButtons = document.getElementById('authButtons');
    const userProfile = document.getElementById('userProfile');
    const userName = document.getElementById('userName');
    const userAvatar = document.getElementById('userAvatar');

    if (token && user) {
      if (authButtons) {
        authButtons.classList.add('hidden');
        authButtons.style.display = 'none';
      }
      if (userProfile) {
        userProfile.classList.remove('hidden');
        userProfile.style.display = 'flex';
      }
      if (userName) {
        userName.textContent = user.username || user.name || user.email || 'Користувач';
      }
      if (userAvatar) {
        userAvatar.src = user.avatar || this.getDefaultAvatar(user.username || user.name);
      }
    } else {
      if (authButtons) {
        authButtons.classList.remove('hidden');
        authButtons.style.display = 'flex';
      }
      if (userProfile) {
        userProfile.classList.add('hidden');
        userProfile.style.display = 'none';
      }
    }
  },

  bindEvents() {
    // Відкриття вікон авторизації
    document.getElementById('loginBtn')?.addEventListener('click', () => this.showModal('login'));
    document.getElementById('registerBtn')?.addEventListener('click', () => this.showModal('register'));
    document.getElementById('logoutBtn')?.addEventListener('click', () => this.logout());

    // Відкриття профілю
    this.profileBtn?.addEventListener('click', () => this.showProfileModal());

    // Закриття хрестиком
    document.querySelectorAll('.close-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const modal = e.target.closest('.modal');
        if (modal) {
          modal.classList.remove('active');
          modal.style.display = 'none';
        }
      });
    });

    // Закриття кліком поза вікном
    window.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) {
        e.target.classList.remove('active');
        e.target.style.display = 'none';
      }
    });

    // Зміна аватарки в модальному вікні
    const modalAvatar = document.getElementById('modalUserAvatar');
    const avatarInput = document.getElementById('avatarInput');

    modalAvatar?.parentElement?.addEventListener('click', () => {
      avatarInput?.click();
    });

    avatarInput?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        // 1. Стискаємо зображення за допомогою помічника
        const compressedBase64 = await compressImage(file, 150, 150);

        // 2. Зберігаємо локально
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        user.avatar = compressedBase64;
        localStorage.setItem('user', JSON.stringify(user));

        this.updateUI();
        this.showProfileModal();

        // 3. Відправляємо легку аватарку на сервер
        if (user.email && typeof API.updateAvatar === 'function') {
          await API.updateAvatar(user.email, compressedBase64);
        }
      } catch (err) {
        console.error('Помилка при обробці або збереженні аватарки:', err);
      }
    });

    const modalUserName = document.getElementById('modalUserName');
    if (modalUserName) {
      modalUserName.onclick = async () => {
        const currentName = modalUserName.textContent.trim();
        const newName = prompt('Введіть нове ім’я:', currentName);

        if (!newName || newName.trim() === '' || newName === currentName) return;

        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const updatedName = newName.trim();

        try {
          // 1. Відправляємо запит на сервер
          if (user.email && typeof API.updateUsername === 'function') {
            await API.updateUsername(user.email, updatedName);
          }

          // 2. Оновлюємо локальне сховище
          user.username = updatedName;
          localStorage.setItem('user', JSON.stringify(user));

          // 3. Оновлюємо інтерфейс
          this.updateUI();
          
          // Оновлюємо текст прямо в модальному вікні без повторного відкриття
          modalUserName.textContent = updatedName;
        } catch (err) {
          console.error('Помилка при зміні імені:', err);
          alert(err.message || 'Не вдалося змінити ім’я');
        }
      };
    }

    // Форма Входу
    this.loginForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('loginEmail').value;
      const pass = document.getElementById('loginPassword').value;

      try {
        const response = await API.login(email, pass);

        if (response.token) {
          localStorage.setItem('token', response.token);
          
          const userObj = response.data || response.user || {};

          const userData = {
            username: userObj.username || userObj.name || email,
            email: userObj.email || email,
            avatar: userObj.avatar || ''
          };

          localStorage.setItem('user', JSON.stringify(userData));

          this.hideModal();
          this.updateUI();
        } else {
          alert(response.message || 'Помилка входу');
        }
      } catch (err) {
        console.error('Помилка при вході:', err);
        alert(err.message || 'Не вдалося увійти');
      }
    });

    // Форма Реєстрації
    this.registerForm?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const emailInput = document.getElementById('regEmail');
        const emailError = document.getElementById('emailError');
        const username = document.getElementById('regUsername').value;
        const password = document.getElementById('regPassword').value;

        emailInput.classList.remove('input-error');
        if (emailError) emailError.textContent = '';

        try {
            await API.register(username, emailInput.value, password);
            this.tempEmail = emailInput.value;
            this.showVerifyModal();
        } catch (err) {
            emailInput.classList.add('input-error');
            if (emailError) {
              emailError.textContent = err.message || 'Користувач з такою поштою вже існує';
            }

            emailInput.addEventListener('input', () => {
              emailInput.classList.remove('input-error');
              if (emailError) emailError.textContent = '';
            }, { once: true });
        }
    });

    // Підтвердження коду
    this.verifyForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = document.getElementById('verifyCode').value;

        try {
            const data = await API.verify(this.tempEmail, code);

            if (data.token || data.success || (data.message && data.message.includes('успіш'))) {
              if (data.token) localStorage.setItem('token', data.token);
              if (data.user) localStorage.setItem('user', JSON.stringify(data.user));

              alert('Email успішно підтверджено!');
              this.hideModal();
              this.updateUI();
            } else {
              alert(data.message || 'Невірний або застарілий код');
            }
        } catch (err) {
            console.error('Помилка підтвердження:', err);
            alert('Помилка з’єднання з сервером');
        }
    });
  },

  showVerifyModal() {
      this.showModal('verify');
  },

  showModal(type) {
    if (!this.authModal) return;
    this.authModal.classList.add('active');
    this.authModal.style.display = 'flex';

    const googleBtnBlock = this.authModal.querySelector('.modal-content > div:first-of-type');
    const divider = this.authModal.querySelector('.modal-content > div:nth-of-type(2)');

    if (this.loginForm) this.loginForm.classList.toggle('hidden', type !== 'login');
    if (this.registerForm) this.registerForm.classList.toggle('hidden', type !== 'register');
    if (this.verifyForm) this.verifyForm.classList.toggle('hidden', type !== 'verify');

    if (googleBtnBlock) googleBtnBlock.style.display = (type === 'verify') ? 'none' : 'block';
    if (divider) divider.style.display = (type === 'verify') ? 'none' : 'block';
  },

  hideModal() {
    if (!this.authModal) return;
    this.authModal.classList.remove('active');
    this.authModal.style.display = 'none';
  },

  showProfileModal() {
    if (!this.profileModal) return;

    const userStr = localStorage.getItem('user');
    let user = {};

    if (userStr && userStr !== 'undefined') {
      try {
        user = JSON.parse(userStr);
      } catch (e) {
        console.error('Помилка зчитування профілю:', e);
      }
    }

    const modalAvatar = document.getElementById('modalUserAvatar');
    if (modalAvatar) {
      modalAvatar.src = user.avatar || this.getDefaultAvatar(user.username || user.name);
    }

    document.getElementById('modalUserName').textContent = user.username || user.name || 'Користувач';
    document.getElementById('modalUserEmail').textContent = user.email || '';

    this.profileModal.classList.add('active');
    this.profileModal.style.display = 'flex';
  },

  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this.updateUI();
  }
};

// Ініціалізація при завантаженні сторінки
document.addEventListener('DOMContentLoaded', () => {
  Auth.init();
});

function compressImage(file, maxWidth = 200, maxHeight = 200) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7)); // Стискаємо до JPEG з якістю 0.7
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}