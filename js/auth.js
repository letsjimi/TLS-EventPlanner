/**
 * TLS Event Manager — Auth & User Management
 * Login, Session, Passwort-Ändern, User-Isolation
 */

const Auth = {
  currentUser: null,
  SESSION_KEY: 'tls_session',
  DEFAULT_USER: { id: 1, username: 'Timon', password: 'TLS-Event-2026!' },

  // ═══════════════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════════════
  async init() {
    // Ensure default user exists in DB
    const user = await db.users.get(this.DEFAULT_USER.id);
    if (!user) {
      await db.users.put({ ...this.DEFAULT_USER });
    }
    // Check for existing session
    const session = this.getSession();
    if (session?.userId) {
      const u = await db.users.get(session.userId);
      if (u) {
        this.currentUser = u;
        return true;
      }
    }
    return false;
  },

  getSession() {
    try { return JSON.parse(localStorage.getItem(this.SESSION_KEY)); } catch { return null; }
  },

  setSession(userId) {
    localStorage.setItem(this.SESSION_KEY, JSON.stringify({ userId, ts: Date.now() }));
  },

  clearSession() {
    localStorage.removeItem(this.SESSION_KEY);
    this.currentUser = null;
  },

  // ═══════════════════════════════════════════════
  // LOGIN OVERLAY
  // ═══════════════════════════════════════════════
  showLogin() {
    // Blur main app
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
            <input type="text" class="form-input" id="login-username" value="Timon" readonly style="background:var(--c-surface-2);color:var(--c-text-3)">
          </div>
          <div class="form-group">
            <label class="form-label">Passwort</label>
            <input type="password" class="form-input" id="login-password" placeholder="Passwort eingeben" autofocus>
          </div>
          <button type="submit" class="btn btn-primary btn-block" style="margin-top:var(--space-md)">
            <i data-lucide="log-in" style="width:18px;height:18px"></i> Anmelden
          </button>
          <div id="login-error" class="login-error" style="display:none"></div>
        </form>
        <div class="login-hint">
          Standard-Passwort: <code>TLS-Event-2026!</code>
        </div>
      </div>
    `;

    overlay.classList.add('active');
    lucide.createIcons({ nodes: [overlay] });

    // Focus password field
    setTimeout(() => document.getElementById('login-password')?.focus(), 100);

    // Bind form
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
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    const btn = document.querySelector('#login-form button[type="submit"]');

    btn.disabled = true;
    errorEl.style.display = 'none';

    const user = await db.users.get(this.DEFAULT_USER.id);
    if (!user || user.password !== password) {
      errorEl.textContent = 'Falsches Passwort. Bitte erneut versuchen.';
      errorEl.style.display = 'block';
      btn.disabled = false;
      return;
    }

    this.currentUser = user;
    this.setSession(user.id);
    this.hideLogin();

    // Re-init app with user context
    await app.initWithUser();
    UI.toast('Willkommen, ' + user.username + '!', 'success');
  },

  // ═══════════════════════════════════════════════
  // LOGOUT
  // ═══════════════════════════════════════════════
  logout() {
    this.clearSession();
    this.showLogin();
    UI.toast('Abgemeldet', 'info');
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

      if (current !== this.currentUser.password) {
        errEl.textContent = 'Aktuelles Passwort ist falsch.';
        errEl.style.display = 'block';
        throw new Error('wrong_current');
      }
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

      await db.users.update(this.currentUser.id, { password: newPw });
      this.currentUser.password = newPw;
      UI.toast('Passwort erfolgreich geändert!', 'success');
    }, 'Passwort ändern');
  },

  // ═══════════════════════════════════════════════
  // USER ISOLATION HELPERS
  // ═══════════════════════════════════════════════
  get userId() {
    return this.currentUser?.id ?? null;
  }
};
