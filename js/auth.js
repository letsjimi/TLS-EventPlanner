/**
 * TLS Event Manager — Auth & User Management
 * Multi-User: Kein Auto-Login, Username+Passwort, Admin kann User erstellen.
 */

const Auth = {
  currentUser: null,

  // ═══════════════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════════════
  async init() {
    const tok = localStorage.getItem('jwt');
    if (tok) {
      API.token = tok;
      try {
        const me = await API.auth.me();
        this.currentUser = { id: me.id, username: me.username, displayName: me.displayName, role: me.isAdmin ? 'admin' : 'user' };
        return true;
      } catch(e) {
        API.token = null; localStorage.removeItem('jwt');
      }
    }
    // Fallback: lokal seeden
    const userCount = await db.users.count();
    if (userCount === 0) {
      await db.users.add({ username: 'Timon', password: 'TLS-Event-2026!', role: 'admin' });
    }
    return false;
  },

  // ═══════════════════════════════════════════════
  // LOGIN OVERLAY
  // ═══════════════════════════════════════════════
  showLogin() {
    document.body.classList.add('login-active');

    let overlay = document.getElementById('login-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'login-overlay';
      overlay.className = 'login-overlay';
      document.body.prepend(overlay);
    }

    overlay.innerHTML = `
      <div class="login-card">
        <div class="login-brand">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="40" height="40">
            <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"/>
            <polyline points="12 22 12 15.5"/>
            <polyline points="22 8.5 12 15.5 2 8.5"/>
          </svg>
          <div>
            <div class="login-brand-title">TLS Event Manager</div>
            <div class="login-brand-sub">Timon Live Sound</div>
          </div>
        </div>
        <form id="login-form" class="login-form">
          <div class="form-group">
            <label class="form-label">Benutzername</label>
            <input type="text" class="form-input" id="login-username" placeholder="Benutzername eingeben" autofocus>
          </div>
          <div class="form-group">
            <label class="form-label">Passwort</label>
            <input type="password" class="form-input" id="login-password" placeholder="Passwort eingeben">
          </div>
          <button type="submit" class="btn btn-primary btn-block" style="margin-top:var(--space-md)">
            <i data-lucide="log-in" style="width:18px;height:18px"></i> Anmelden
          </button>
          <div id="login-error" class="login-error" style="display:none"></div>
        </form>
      </div>
    `;

    overlay.classList.add('active');
    lucide.createIcons({ nodes: [overlay] });

    setTimeout(() => document.getElementById('login-username')?.focus(), 100);

    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.attemptLogin();
    });
  },

  hideLogin() {
    document.body.classList.remove('login-active');
    document.getElementById('login-overlay')?.classList.remove('active');
  },

  // ═══════════════════════════════════════════════
  // LOGIN LOGIC
  // ═══════════════════════════════════════════════
  async attemptLogin() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    const btn = document.querySelector('#login-form button[type="submit"]');

    btn.disabled = true;
    errorEl.style.display = 'none';

    if (!username) {
      errorEl.textContent = 'Bitte Benutzername eingeben.';
      errorEl.style.display = 'block';
      btn.disabled = false;
      return;
    }

    // Zuerst API-Login versuchen
    try {
      const res = await API.auth.login(username, password);
      API.token = res.token;
      localStorage.setItem('jwt', res.token);
      this.currentUser = { id: res.user.id, username: res.user.username, displayName: res.user.displayName, role: res.user.isAdmin ? 'admin' : 'user' };
      // Persistiere lokal für Offline-Fallback
      try {
        const localUser = await db.users.where('username').equals(username).first();
        if (!localUser) {
          await db.users.add({ username, password, role: this.currentUser.role, displayName: this.currentUser.displayName });
        } else {
          await db.users.update(localUser.id, { password, role: this.currentUser.role, displayName: this.currentUser.displayName });
        }
      } catch (e) { console.warn('Local user cache failed:', e); }
      this.hideLogin();
      await app.initWithUser();
      UI.toast('Willkommen, ' + this.currentUser.displayName + '!', 'success');
      return;
    } catch (apiErr) {
      // API nicht erreichbar: Fallback auf lokale DB
      console.warn('API Login fehlgeschlagen, Fallback auf local:', apiErr.message);
    }

    const user = await db.users.where('username').equals(username).first();
    if (!user || user.password !== password) {
      errorEl.textContent = 'Falscher Benutzername oder Passwort.';
      errorEl.style.display = 'block';
      btn.disabled = false;
      return;
    }

    this.currentUser = user;
    this.hideLogin();

    await app.initWithUser();
    UI.toast('Willkommen, ' + user.username + '!', 'success');
  },

  // ═══════════════════════════════════════════════
  // LOGOUT
  // ═══════════════════════════════════════════════
  logout() {
    API.token = null;
    localStorage.removeItem('jwt');
    this.currentUser = null;
    location.reload();
  },

  // ═══════════════════════════════════════════════
  // PASSWORD CHANGE
  // ═══════════════════════════════════════════════
  showPasswordChange() {
    UI.openModal('Passwort ändern', `
      <form id="pw-change-form">
        <div class="form-group">
          <label class="form-label">Aktuelles Passwort</label>
          <input type="password" class="form-input" id="pw-current" required>
        </div>
        <div class="form-group">
          <label class="form-label">Neues Passwort</label>
          <input type="password" class="form-input" id="pw-new" required minlength="6">
        </div>
        <div class="form-group">
          <label class="form-label">Neues Passwort wiederholen</label>
          <input type="password" class="form-input" id="pw-confirm" required>
        </div>
        <div id="pw-error" style="color:var(--c-danger);font-size:0.85rem;display:none;margin-top:var(--space-sm)"></div>
      </form>
    `, async () => {
      const current = document.getElementById('pw-current').value;
      const newPw = document.getElementById('pw-new').value;
      const confirm = document.getElementById('pw-confirm').value;
      const errEl = document.getElementById('pw-error');

      if (newPw !== confirm) {
        errEl.textContent = 'Passwörter stimmen nicht überein.';
        errEl.style.display = 'block';
        throw new Error('mismatch');
      }
      if (newPw.length < 6) {
        errEl.textContent = 'Mindestens 6 Zeichen erforderlich.';
        errEl.style.display = 'block';
        throw new Error('too_short');
      }

      // Zuerst API-Change versuchen wenn online
      if (API.token && this.currentUser && this.currentUser.id) {
        try {
          await API.auth.changePassword(current, newPw);
          UI.toast('Passwort erfolgreich geändert!', 'success');
          // Auch lokal aktualisieren falls vorhanden
          const localUser = await db.users.where('username').equals(this.currentUser.username).first();
          if (localUser) {
            await db.users.update(localUser.id, { password: newPw });
          }
          return;
        } catch (apiErr) {
          if (apiErr.message && (apiErr.message.includes('incorrect') || apiErr.message.includes('Invalid') || apiErr.message.includes('401'))) {
            errEl.textContent = 'Aktuelles Passwort ist falsch.';
            errEl.style.display = 'block';
            throw new Error('wrong_current');
          }
          // API nicht erreichbar → Fallback lokal
          console.warn('API password change failed, falling back to local:', apiErr.message);
        }
      }

      // Lokales Passwort ändern (Offline-Mode)
      const localUser = await db.users.where('username').equals(this.currentUser.username).first();
      if (!localUser || localUser.password !== current) {
        errEl.textContent = 'Aktuelles Passwort ist falsch.';
        errEl.style.display = 'block';
        throw new Error('wrong_current');
      }
      await db.users.update(localUser.id, { password: newPw });
      this.currentUser.password = newPw;
      UI.toast('Passwort erfolgreich geändert!', 'success');
    }, 'Passwort ändern');
  },

  // ═══════════════════════════════════════════════
  // ADMIN: CREATE USER
  // ═══════════════════════════════════════════════
  isAdmin() {
    return this.currentUser?.id === 1 || this.currentUser?.role === 'admin';
  },

  async createUser(username, password) {
    if (!this.isAdmin()) {
      throw new Error('Nur Admins können neue Benutzer erstellen.');
    }
    if (!username || !password || password.length < 6) {
      throw new Error('Ungültige Eingabe: Benutzername erforderlich, Passwort mindestens 6 Zeichen.');
    }
    const existing = await db.users.where('username').equals(username).first();
    if (existing) {
      throw new Error('Ein Benutzer mit diesem Namen existiert bereits.');
    }
    const id = await db.users.add({ username, password, role: 'user' });
    return id;
  },

  // ═══════════════════════════════════════════════
  // USER ISOLATION HELPERS
  // ═══════════════════════════════════════════════
  get userId() {
    return this.currentUser?.id ?? null;
  }
};
