const API_BASE = '/api/auth';

const API = {
  async login(email, password) {
    const res = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    return res.json();
  },

  async register(username, email, password) {
    const res = await fetch(`${API_BASE}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });

    const data = await res.json();
    
    if (!res.ok) {
      throw new Error(data.message || 'Помилка при реєстрації');
    }

    return data;
  },

  async verify(email, code) {
    const res = await fetch(`${API_BASE}/verify-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || `Помилка сервера: ${res.status}`);
    }
    return data;
  },

  async updateAvatar(email, avatarData) {
    const res = await fetch(`${API_BASE}/avatar`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, avatar: avatarData })
    });
    return await res.json();
  },

  async updateUsername(email, username) {
    const response = await fetch(`${API_BASE}/update-username`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ email, username })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || 'Не удалось обновить имя');
    }

    return await response.json();
  }
};