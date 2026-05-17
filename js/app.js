/**
 * TLS Event Manager — Main Application
 * Router, Pages, CRUD, State Management
 */

const app = {
  currentPage: 'dashboard',
  currentEventId: null,
  _navSeq: 0,

  // ═══════════════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════════════
  async init() {
    const loggedIn = await Auth.init();
    if (!loggedIn) {
      Auth.showLogin();
      return;
    }
    await this.initWithUser();
  },

  async initWithUser() {
    const uname = document.getElementById('topbar-username');
    if (uname && Auth.currentUser) uname.textContent = Auth.currentUser.username;
    await seedDatabase();
    this.bindNavigation();
    this.bindMobileMenu();
    this.bindGlobalSearch();
    this.navigate(location.hash || '#dashboard');
    // Auto-sync if online
    if (API.token) API.sync.all().catch(console.warn);
  },

  // ═══════════════════════════════════════════════
  // ROUTER
  // ═══════════════════════════════════════════════
  navigate(hash) {
    const raw = hash.replace('#', '') || 'dashboard';
    const [mainPage, ...subParts] = raw.split('/');
    const subPage = subParts.join('/');

    // SHARE ROUTE (/share/:token)
    if (mainPage === 'share' && subPage) {
      this.renderShare(decodeURIComponent(subPage)).then(html => {
        document.getElementById('page-content').innerHTML = html;
        document.querySelector('.sidebar')?.classList.add('hidden');
        document.querySelector('.topbar')?.classList.add('hidden');
        lucide.createIcons();
      });
      return;
    }

    // Auth-Check
    if (!Auth.currentUser) { Auth.showLogin(); return; }

    // NORMAL ROUTE
    const seq = ++this._navSeq;
    this.currentPage = mainPage;

    // Auf Mobile: Sidebar immer schließen wenn offen
    const sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('open')) {
      sidebar.classList.remove('open');
      document.getElementById('sidebar-overlay')?.classList.remove('active');
    }

    document.querySelector('.sidebar')?.classList.remove('hidden');
    document.querySelector('.topbar')?.classList.remove('hidden');

    // Sidebar active state
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === mainPage);
    });

    const content = document.getElementById('page-content');
    content.innerHTML = '<div style="padding:var(--space-2xl);text-align:center;color:var(--c-text-3)">Lädt...</div>';

    // Route to page renderer
    const renderers = {
      dashboard: () => this.renderDashboard(),
      events:    () => this.renderEvents(),
      planner:   () => this.renderPlanner(subPage),
      contacts:  () => this.renderContacts(subPage),
      equipment: () => this.renderEquipment(subPage),
      catalog:   () => this.openCatalogEditorFromNav(),
      personnel: () => this.renderPersonnel(subPage),
      calculation: () => this.renderCalculation(subPage),
      market:    () => this.renderMarket(),
      calendar:  () => {
        let cy = new Date().getFullYear(), cm = new Date().getMonth();
        if (subPage) {
          const parts = subPage.split('/');
          if (parts[0]) cy = parseInt(parts[0]);
          if (parts[1]) cm = parseInt(parts[1]);
        }
        return this.showAvailabilityCalendar(cy, cm);
      },
      settings:  () => this.renderSettings()
    };

    const renderer = renderers[mainPage] || renderers.dashboard;
    renderer().then(html => {
      // Guard: abbrechen wenn inzwischen neere Navigation passiert ist
      if (this._navSeq !== seq) return;
      content.innerHTML = html;
      lucide.createIcons();
      this.postRender(mainPage);
    });
  },

  postRender(page) {
    if (page === 'dashboard') this.initDashboardInteractions();
  },

  bindNavigation() {
    document.querySelectorAll('.nav-item').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const page = el.dataset.page || el.getAttribute('href')?.replace('#', '');
        if (!page) return;
        app.navigate('#' + page);
        // Auf Mobile Sidebar schließen
        document.getElementById('sidebar')?.classList.remove('open');
        document.getElementById('sidebar-overlay')?.classList.remove('active');
      });
    });
  },

  bindMobileMenu() {
    this.toggleSidebar = () => {
      document.getElementById('sidebar').classList.toggle('open');
      const overlay = document.getElementById('sidebar-overlay');
      if (overlay) overlay.classList.toggle('active');
    };
    document.getElementById('menu-toggle').addEventListener('click', () => {
      this.toggleSidebar();
    });
  },

  bindGlobalSearch() {
    const search = document.getElementById('global-search');
    search.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase();
      if (this.currentPage === 'events') this.refreshEvents();
      if (this.currentPage === 'contacts') this.refreshContacts();
      if (this.currentPage === 'equipment') this.refreshEquipment();
    });
  },

  refreshEvents() {
    const grid = document.getElementById('events-grid');
    if (!grid) return;
    this.renderEvents(this.searchQuery).then(html => {
      grid.innerHTML = html;
      lucide.createIcons();
    });
  },

  refreshContacts() {
    const list = document.getElementById('contacts-list');
    if (!list) return;
    this.renderContacts(null, this.searchQuery).then(html => {
      list.innerHTML = html;
      lucide.createIcons();
    });
  },

  refreshEquipment() {
    const grid = document.getElementById('equipment-grid');
    if (!grid) return;
    this.renderEquipment(null, this.searchQuery).then(html => {
      // Nur Event-Liste ersetzen (nicht Detail-Ansicht)
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      const newGrid = tmp.querySelector('#equipment-grid');
      if (newGrid) grid.innerHTML = newGrid.innerHTML;
      lucide.createIcons();
    });
  },


  // ═══════════════════════════════════════════════
  // USER MENU
  // ═══════════════════════════════════════════════
  toggleUserMenu() {
    const dd = document.getElementById('user-dropdown');
    if (!dd) return;
    const show = dd.style.display === 'none';
    dd.style.display = show ? 'block' : 'none';
  },

  // ═══════════════════════════════════════════════
  // DASHBOARD
  // ═══════════════════════════════════════════════
  async renderDashboard() {
    const events = await db.events.where('userId').equals(Auth.userId || 1).toArray();
    const confirmed = events.filter(e => ['confirmed', 'paid', 'done'].includes(e.status));
    const totalRevenue = confirmed.reduce((s, e) => s + (e.totalPrice || 0), 0);
    const openOffers = events.filter(e => e.status === 'offer').length;
    const thisMonth = events.filter(e => {
      if (!e.date) return false;
      const d = new Date(e.date + 'T00:00:00');
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;

    // Update nav badge
    document.getElementById('nav-events-count').textContent = events.length;

    // Upcoming events (next 5)
    const upcoming = events
      .filter(e => e.date && new Date(e.date + 'T00:00:00') >= new Date().setHours(0,0,0,0))
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 5);

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">Dashboard</h1>
          <p class="page-subtitle">Übersicht deiner Veranstaltungsaufträge</p>
        </div>
      </div>

      <div class="grid-4 mb-3">
        <div class="stat-card">
          <div class="stat-icon accent"><i data-lucide="euro"></i></div>
          <div>
            <div class="stat-value">${UI.euro(totalRevenue)}</div>
            <div class="stat-label">Gesamtumsatz</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon success"><i data-lucide="check-circle"></i></div>
          <div>
            <div class="stat-value">${confirmed.length}</div>
            <div class="stat-label">Bestätigte Aufträge</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon warning"><i data-lucide="file-text"></i></div>
          <div>
            <div class="stat-value">${openOffers}</div>
            <div class="stat-label">Offene Angebote</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon info"><i data-lucide="calendar"></i></div>
          <div>
            <div class="stat-value">${thisMonth}</div>
            <div class="stat-label">Diesen Monat</div>
          </div>
        </div>
      </div>

      <!-- KANBAN BOARD -->
      <div class="card mb-3">
        <div class="card-header">
          <div class="card-title"><i data-lucide="columns"></i>Auftrags-Pipeline</div>
        </div>
        ${await this.renderKanban(events)}
      </div>

      <!-- UPCOMING EVENTS -->
      <div class="card">
        <div class="card-header">
          <div class="card-title"><i data-lucide="clock"></i>Kommende Veranstaltungen</div>
        </div>
      ${upcoming.length === 0 ? UI.emptyState('calendar-x', 'Keine kommenden Events', 'Erstelle deinen ersten Auftrag.') : `
        <table class="data-table">
          <thead>
            <tr>
              <th>Datum</th>
              <th>Kunde</th>
              <th>Typ</th>
              <th>Location</th>
              <th style="text-align:right">Preis</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${upcoming.map(e => `
              <tr onclick="app.openEvent(${e.id})" style="cursor:pointer">
                <td><strong>${UI.formatDate(e.date)}</strong><br><span style="font-size:0.75rem;color:var(--c-text-3)">${UI.relativeDate(e.date)}</span></td>
                <td>${e.clientName}</td>
                <td>${e.eventType}</td>
                <td>${e.locations || '-'}</td>
                <td style="text-align:right;font-weight:600">${UI.euro(e.totalPrice || 0)}</td>
                <td>${UI.statusBadge(e.status)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
      </div>`;
  },

  async renderKanban(events) {
    const columns = [
      { key: 'inquiry',   label: 'Anfrage',     color: '#3b82f6' },
      { key: 'offer',     label: 'Angebot',     color: '#f59e0b' },
      { key: 'inspected', label: 'Besichtigt',  color: '#8b5cf6' },
      { key: 'confirmed', label: 'Bestätigt',   color: '#22c55e' },
      { key: 'paid',      label: 'Bezahlt',     color: '#06b6d4' },
      { key: 'done',      label: 'Abgeschlossen', color: '#64748b' },
      { key: 'cancelled', label: 'Storniert',   color: '#ef4444' }
    ];

    let html = '<div class="kanban" id="kanban-board">';
    for (const col of columns) {
      const colEvents = events.filter(e => e.status === col.key);
      html += `
        <div class="kanban-column" data-status="${col.key}" ondragover="app._kanbanDragOver(event)" ondragleave="app._kanbanDragLeave(event)" ondrop="app._kanbanDrop(event)">
          <div class="kanban-header">
            <div class="kanban-title" style="color:${col.color}">
              <span style="width:8px;height:8px;border-radius:50%;background:${col.color};display:inline-block"></span>
              ${col.label}
            </div>
            <span class="kanban-count" data-status="${col.key}">${colEvents.length}</span>
          </div>
          <div class="kanban-drophere" data-status="${col.key}">Hier ablegen</div>
          ${colEvents.map(e => `
            <div class="kanban-card" data-event-id="${e.id}" data-current-status="${e.status}" draggable="true" onclick="app.openEvent(${e.id})" ondragstart="app._kanbanDragStart(event)" ondragend="app._kanbanDragEnd(event)" oncontextmenu="event.preventDefault();app._kanbanContextMenu(${e.id},'${e.status}')" ontouchstart="app._kanbanTouchStart(event,this)" ontouchmove="app._kanbanTouchMove(event,this)" ontouchend="app._kanbanTouchEnd(event,this)">
              <div class="kanban-card-title">${e.clientName || 'Unbekannt'}</div>
              <div class="kanban-card-meta">
                <span>📅 ${UI.formatDate(e.date)} · ${e.eventType}</span>
                <span>💶 ${UI.euro(e.totalPrice || 0)}</span>
                ${e.locations ? `<span>📍 ${e.locations}</span>` : ''}
              </div>
            </div>
          `).join('')}
        </div>`;
    }
    html += '</div>';
    return html;
  },

  initDashboardInteractions() {
    this._kanbanSetup();
  },

  // ── Desktop Drag & Drop ──
  _kanbanDragStart(ev) {
    const card = ev.target.closest('.kanban-card');
    if (!card) return;
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData('text/plain', card.dataset.eventId);
    card.classList.add('dragging');
    this._dragEventId = card.dataset.eventId;
  },
  _kanbanDragEnd(ev) {
    document.querySelectorAll('.kanban-card').forEach(c => c.classList.remove('dragging'));
    document.querySelectorAll('.kanban-drophere').forEach(d => d.classList.remove('visible'));
    this._dragEventId = null;
  },
  _kanbanDragOver(ev) {
    ev.preventDefault();
    const col = ev.currentTarget;
    col.querySelector('.kanban-drophere')?.classList.add('visible');
  },
  _kanbanDragLeave(ev) {
    const col = ev.currentTarget;
    col.querySelector('.kanban-drophere')?.classList.remove('visible');
  },
  _kanbanContextMenu(id, currentStatus) {
    // Mobile: long-press = Kontextmenü
    const nextStatuses = this._getNextStatuses(currentStatus);
    UI.openModal('Status ändern', `
      <div style="display:flex;flex-direction:column;gap:var(--space-sm)">
        ${nextStatuses.map(s => `
          <button class="btn btn-secondary" style="text-align:left;gap:8px;justify-content:flex-start"
                  onclick="UI.closeModal();app.changeEventStatus(${id},'${s.key}');app.navigate('#dashboard')">
            <span style="width:10px;height:10px;border-radius:50%;background:${s.color};display:inline-block"></span> ${s.label}
          </button>
        `).join('')}
      </div>
    `, null, 'Abbrechen', true);
  },
  _getNextStatuses(current) {
    const all = [
      { key: 'inquiry', label: 'Anfrage', color: '#3b82f6' },
      { key: 'offer', label: 'Angebot', color: '#f59e0b' },
      { key: 'inspected', label: 'Besichtigt', color: '#8b5cf6' },
      { key: 'confirmed', label: 'Bestätigt', color: '#22c55e' },
      { key: 'paid', label: 'Bezahlt', color: '#06b6d4' },
      { key: 'done', label: 'Abgeschlossen', color: '#64748b' },
      { key: 'cancelled', label: 'Storniert', color: '#ef4444' }
    ];
    return all.filter(s => s.key !== current);
  },

  // ── Mobile Touch ──
  _kanbanTouchStart(ev, el) {
    if (this._kanbanTouchTimer) clearTimeout(this._kanbanTouchTimer);
    this._kanbanTouchMoved = false;
    this._kanbanTouchStartX = ev.touches[0].clientX;
    this._kanbanTouchStartY = ev.touches[0].clientY;
    // Long-Press (>500ms) → Status-Ändern-Modal
    this._kanbanTouchTimer = setTimeout(() => {
      this._kanbanTouchTimer = null;
      this._kanbanTouchMoved = true; // verhindert Click nach Long-Press
      this._kanbanContextMenu(parseInt(el.dataset.eventId), el.dataset.currentStatus);
    }, 500);
  },
  _kanbanTouchMove(ev, el) {
    if (!this._kanbanTouchStartX) return;
    const dx = Math.abs(ev.touches[0].clientX - this._kanbanTouchStartX);
    const dy = Math.abs(ev.touches[0].clientY - this._kanbanTouchStartY);
    if (dx > 10 || dy > 10) {
      // Finger bewegt sich → Long-Press abbrechen, normal scrollen
      if (this._kanbanTouchTimer) { clearTimeout(this._kanbanTouchTimer); this._kanbanTouchTimer = null; }
      this._kanbanTouchMoved = true;
    }
  },
  _kanbanTouchEnd(ev, el) {
    if (this._kanbanTouchTimer) { clearTimeout(this._kanbanTouchTimer); this._kanbanTouchTimer = null; }
    if (!this._kanbanTouchMoved) {
      // Kurzer Tap ohne Bewegung → onclick öffnet Event (kein preventDefault)
    }
    this._kanbanTouchMoved = false;
    this._kanbanTouchStartX = null;
    this._kanbanTouchStartY = null;
  },

  _kanbanSetup() {
    // Setup wird per Inline-Events gemacht
  },

  async _kanbanDrop(ev) {
    ev.preventDefault();
    const col = ev.currentTarget;
    const newStatus = col.dataset.status;
    const eventId = parseInt(ev.dataTransfer.getData('text/plain'));
    if (!eventId || !newStatus) return;
    const e = await db.events.get(eventId);
    if (!e || e.status === newStatus) return;
    await this.changeEventStatus(eventId, newStatus);
    // Re-render
    this.navigate('#dashboard');
  },

  // ═══════════════════════════════════════════════
  // EVENTS LIST
  // ═══════════════════════════════════════════════
  async renderEvents(search = '') {
    let events = await db.events.where('userId').equals(Auth.userId || 1).toArray();
    if (search) {
      events = events.filter(e =>
        (e.clientName || '').toLowerCase().includes(search) ||
        (e.eventType || '').toLowerCase().includes(search) ||
        (e.locations || '').toLowerCase().includes(search) ||
        (e.orderNumber || '').toLowerCase().includes(search)
      );
    }
    events.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">Aufträge</h1>
          <p class="page-subtitle">${events.length} Aufträge im System</p>
        </div>
        <button class="btn btn-primary" onclick="app.createEvent()">
          <i data-lucide="plus"></i>Neuer Auftrag
        </button>
      </div>

      <div id="events-grid">
      ${events.length === 0 ? UI.emptyState('inbox', 'Keine Aufträge', 'Erstelle deinen ersten Auftrag mit dem Button oben.') : `
        <div class="card">
          <table class="data-table">
            <thead>
              <tr>
                <th>Auftrags-Nr</th>
                <th>Datum</th>
                <th>Event-Typ</th>
                <th>Kunde</th>
                <th>Location</th>
                <th style="text-align:right">Gesamtpreis</th>
                <th>Status</th>
                <th style="width:40px"></th>
              </tr>
            </thead>
            <tbody>
              ${events.map(e => `
                <tr onclick="app.openEvent(${e.id})" style="cursor:pointer">
                  <td><strong>${e.orderNumber}</strong></td>
                  <td>${UI.formatDate(e.date)} · ${UI.relativeDate(e.date)}</td>
                  <td>${e.eventType}</td>
                  <td>${e.clientName}</td>
                  <td>${e.locations || '-'}</td>
                  <td style="text-align:right;font-weight:600">${UI.euro(e.totalPrice || 0)}</td>
                  <td>${UI.statusBadge(e.status)}</td>
                  <td>
                    <button class="btn btn-icon btn-ghost" onclick="event.stopPropagation();app.editEvent(${e.id})">
                      <i data-lucide="pencil" style="width:16px;height:16px"></i>
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
      </div>`;
  },

  // ═══════════════════════════════════════════════
  // CREATE / EDIT EVENT
  // ═══════════════════════════════════════════════
  async createEvent() {
    const count = await db.events.where('userId').equals(Auth.userId || 1).count();
    const nextNum = `TLS-2026-${String(count + 1).padStart(3, '0')}`;

    const fields = [
      { name: 'orderNumber', label: 'Auftrags-Nr', placeholder: 'z.B. TLS-2026-004' },
      { name: 'date', label: 'Datum', type: 'date' },
      { name: 'orderType', label: 'Auftrags-Art', type: 'select', options: [
        { value: 'event', label: '🎉 Event (mit Service & Personal)' },
        { value: 'rental', label: '📦 Nur Verleih (Equipment-Miete)' }
      ]},
      { name: 'eventType', label: 'Event-Typ', type: 'select', options: [
        { value: 'Hochzeit', label: '💒 Hochzeit' },
        { value: 'Firmenfeier', label: '🏢 Firmenfeier' },
        { value: 'Konzert', label: '🎸 Konzert' },
        { value: 'Geburtstag', label: '🎉 Geburtstag' },
        { value: 'Club-Event', label: '🌃 Club-Event' },
        { value: 'Konferenz', label: '🎤 Konferenz' },
        { value: 'Sonstiges', label: '📌 Sonstiges' }
      ]},
      { name: 'clientName', label: 'Kunde / Brautpaar', placeholder: 'Name des Auftraggebers' },
      { name: 'locations', label: 'Location(en)', placeholder: 'z.B. Kirche → Festhalle' },
      { name: 'totalPrice', label: 'Gesamtpreis (€)', type: 'number', step: '0.01' },
      { name: 'deposit', label: 'Anzahlung (€)', type: 'number', step: '0.01' },
      { name: 'km', label: 'Kilometer (km)', type: 'number', step: '1' },
      { name: 'status', label: 'Status', type: 'select', options: [
        { value: 'inquiry', label: 'Anfrage' },
        { value: 'offer', label: 'Angebot' },
        { value: 'inspected', label: 'Besichtigt' },
        { value: 'confirmed', label: 'Bestätigt' },
        { value: 'paid', label: 'Bezahlt' },
        { value: 'done', label: 'Abgeschlossen' },
        { value: 'cancelled', label: 'Storniert' }
      ]},
      { name: 'notes', label: 'Notizen', type: 'textarea', placeholder: 'Besonderheiten, Wünsche, Hinweise...' }
    ];

    UI.openModal('Neuer Auftrag',
      `<form id="event-form">
        <div class="form-row">
          ${UI.form(fields.slice(0, 2), { orderNumber: nextNum })}
        </div>
        <div class="form-row">
          ${UI.form(fields.slice(2, 4))}
        </div>
        ${UI.form([fields[4]])}
        <div class="form-row">
          ${UI.form(fields.slice(5, 7))}
        </div>
        ${UI.form(fields.slice(7))}
      </form>`,
      async () => {
        const data = UI.getFormData(document.getElementById('event-form'));
        data.orderType = data.orderType || 'event';
        const total = data.totalPrice !== undefined ? data.totalPrice : e.totalPrice;
        const dep = data.deposit !== undefined ? data.deposit : e.deposit;
        data.remaining = total - dep;
        data.statusLabel = { inquiry:'Anfrage', offer:'Angebot', inspected:'Besichtigt',
          confirmed:'Bestätigt', paid:'Bezahlt', done:'Abgeschlossen', cancelled:'Storniert' }[data.status];
        data.userId = Auth.userId || 1;
        data.synced = API.token ? 0 : 1;

        let id;
        if (API.token) {
          try {
            const res = await API.events.create(data);
            id = res.id;
            data.id = id;
            data.synced = 1; // mark synced immediately so pushAll doesn't duplicate
            await db.events.add(data);
          } catch(e) {
            console.warn('API create failed, falling back to local:', e.message);
            id = await db.events.add(data);
          }
        } else {
          id = await db.events.add(data);
        }

        data.id = id;

        // Default Personnel für Events (außer Verleih)
        if (data.orderType !== 'rental') {
          const pers = [
            { eventId: id, role: 'Haupttechniker (Sound/Licht)', qty: 1, unit: 'Pauschale', price: 650, needed: true, sortOrder: 1 },
            { eventId: id, role: 'Hilfskraft (Aufbau/Abbau)', qty: 1, unit: 'Pauschale', price: 200, needed: true, sortOrder: 2 },
            { eventId: id, role: 'Anfahrt', qty: data.km || 0, unit: 'km', price: 0.70, needed: true, sortOrder: 3 },
            { eventId: id, role: 'Verpflegung', qty: 2, unit: 'Pers.', price: 25, needed: true, sortOrder: 4 }
          ];
          if (API.token) {
            try { await API.personnel.save(id, pers); } catch(e) { console.warn('API personnel failed:', e.message); }
          }
          await db.eventPersonnel.bulkAdd(pers);
        } else {
          // Für Verleih: nur Anfahrt
          const pers = [
            { eventId: id, role: 'Anfahrt / Lieferung', qty: data.km || 0, unit: 'km', price: 0.70, needed: true, sortOrder: 1 }
          ];
          if (API.token) {
            try { await API.personnel.save(id, pers); } catch(e) { console.warn('API personnel failed:', e.message); }
          }
          await db.eventPersonnel.bulkAdd(pers);
        }
        UI.toast('Auftrag erstellt: ' + data.orderNumber, 'success');
        this.navigate('#events');
      }
    );
  },

  async editEvent(id) {
    const e = await db.events.get(id);
    if (!e) return;

    const fields = [
      { name: 'orderNumber', label: 'Auftrags-Nr' },
      { name: 'date', label: 'Datum', type: 'date' },
      { name: 'orderType', label: 'Auftrags-Art', type: 'select', options: [
        { value: 'event', label: '🎉 Event (mit Service & Personal)' },
        { value: 'rental', label: '📦 Nur Verleih (Equipment-Miete)' }
      ]},
      { name: 'eventType', label: 'Event-Typ', type: 'select', options: [
        { value: 'Hochzeit', label: 'Hochzeit' },
        { value: 'Firmenfeier', label: 'Firmenfeier' },
        { value: 'Konzert', label: 'Konzert' },
        { value: 'Geburtstag', label: 'Geburtstag' },
        { value: 'Club-Event', label: 'Club-Event' },
        { value: 'Konferenz', label: 'Konferenz' },
        { value: 'Sonstiges', label: 'Sonstiges' }
      ]},
      { name: 'clientName', label: 'Kunde' },
      { name: 'locations', label: 'Location(en)' },
      { name: 'totalPrice', label: 'Gesamtpreis', type: 'number', step: '0.01' },
      { name: 'deposit', label: 'Anzahlung', type: 'number', step: '0.01' },
      { name: 'km', label: 'Kilometer', type: 'number', step: '1' },
      { name: 'status', label: 'Status', type: 'select', options: [
        { value: 'inquiry', label: 'Anfrage' },
        { value: 'offer', label: 'Angebot' },
        { value: 'inspected', label: 'Besichtigt' },
        { value: 'confirmed', label: 'Bestätigt' },
        { value: 'paid', label: 'Bezahlt' },
        { value: 'done', label: 'Abgeschlossen' },
        { value: 'cancelled', label: 'Storniert' }
      ]},
      { name: 'notes', label: 'Notizen', type: 'textarea' }
    ];

    UI.openModal('Auftrag bearbeiten',
      `<form id="edit-form">
        <div class="form-row">${UI.form(fields.slice(0,2), e)}</div>
        <div class="form-row">${UI.form(fields.slice(2,4), e)}</div>
        ${UI.form([fields[4]], e)}
        <div class="form-row">${UI.form(fields.slice(5,7), e)}</div>
        ${UI.form(fields.slice(7), e)}
      </form>`,
      async () => {
        const data = UI.getFormData(document.getElementById('edit-form'));
        const total = data.totalPrice !== undefined ? data.totalPrice : e.totalPrice;
        const dep = data.deposit !== undefined ? data.deposit : e.deposit;
        data.remaining = total - dep;
        data.statusLabel = { inquiry:'Anfrage', offer:'Angebot', inspected:'Besichtigt',
          confirmed:'Bestätigt', paid:'Bezahlt', done:'Abgeschlossen', cancelled:'Storniert' }[data.status];
        data.userId = Auth.userId || 1;
        if (API.token) {
          try { await API.events.update(id, data); } catch(e) { console.warn('API update failed:', e.message); }
        }
        await db.events.update(id, data);
        UI.toast('Auftrag aktualisiert', 'success');
        this.navigate('#events');
      }
    );
  },

  async deleteEvent(id) {
    UI.confirm('Diesen Auftrag wirklich löschen? Alle zugehörigen Daten (Locations, Kontakte, Equipment) werden ebenfalls gelöscht.', async () => {
      if (API.token) {
        try { await API.events.remove(id); } catch(e) { console.warn('API delete failed:', e.message); }
      }
      await db.locations.where('eventId').equals(id).delete();
      await db.contacts.where('eventId').equals(id).delete();
      await db.timeline.where('eventId').equals(id).delete();
      await db.equipmentItems.where('eventId').equals(id).delete();
      await db.payments.where('eventId').equals(id).delete();
      await db.eventTodos.where('eventId').equals(id).delete();
      await db.eventPersonnel.where('eventId').equals(id).delete();
      await db.events.delete(id);
      UI.toast('Auftrag gelöscht', 'info');
      this.navigate('#events');
    });
  },

  // ═══════════════════════════════════════════════
  // EVENT DETAIL (Planner)
  // ═══════════════════════════════════════════════
  async renderPlanner(eventId) {
    if (!eventId) {
      // Show event selector
      const events = await db.events.where('userId').equals(Auth.userId || 1).toArray();
      return `
        <div class="page-header">
          <h1 class="page-title">Planung</h1>
        </div>
        <p class="text-muted mb-2">Wähle einen Auftrag für die Detail-Planung:</p>
        <div class="grid-2">
          ${events.map(e => `
            <div class="card" style="cursor:pointer" onclick="app.navigate('#planner/${e.id}')">
              <div style="font-weight:700;font-size:1.1rem;margin-bottom:4px">${e.clientName}</div>
              <div class="text-muted" style="font-size:0.875rem">${e.orderNumber} · ${UI.formatDate(e.date)} · ${e.eventType}</div>
              <div class="mt-1">${UI.statusBadge(e.status)}</div>
            </div>
          `).join('')}
        </div>`;
    }

    this.currentEventId = parseInt(eventId);
    const e = await db.events.get(this.currentEventId);
    if (!e) return '<div class="page-header"><h1>Auftrag nicht gefunden</h1></div>';

    const locations = await db.locations.where('eventId').equals(this.currentEventId).sortBy('sortOrder');
    const timeline = await db.timeline.where('eventId').equals(this.currentEventId).sortBy('sortOrder');

    return `
      <div class="page-header">
        <div>
          <div style="display:flex;align-items:center;gap:var(--space-sm);margin-bottom:4px">
            <span style="font-size:0.875rem;color:var(--c-text-3)">${e.orderNumber}</span>
            <select onchange="app.changeEventStatus(${e.id}, this.value)" class="form-select" style="width:auto;padding:4px 8px;font-size:0.8125rem;height:auto;min-height:auto;background:var(--c-bg);border:1px solid var(--c-border);border-radius:var(--radius-md);color:var(--c-text);font-weight:600">
              <option value="inquiry"   ${e.status==='inquiry'   ? 'selected' : ''}>🔵 Anfrage</option>
              <option value="offer"     ${e.status==='offer'     ? 'selected' : ''}>🟡 Angebot</option>
              <option value="inspected" ${e.status==='inspected' ? 'selected' : ''}>🟣 Besichtigt</option>
              <option value="confirmed" ${e.status==='confirmed' ? 'selected' : ''}>🟢 Bestätigt</option>
              <option value="paid"      ${e.status==='paid'      ? 'selected' : ''}>💧 Bezahlt</option>
              <option value="done"      ${e.status==='done'      ? 'selected' : ''}>⚪ Abgeschlossen</option>
              <option value="cancelled" ${e.status==='cancelled' ? 'selected' : ''}>🔴 Storniert</option>
            </select>
          </div>
          <h1 class="page-title">${e.clientName}</h1>
          <p class="page-subtitle">${e.eventType} · ${UI.formatDate(e.date)} · ${e.locations || 'Keine Location'}</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary btn-sm" onclick="app.generateOfferPDF(${e.id})" title="Angebot als PDF">
            <i data-lucide="file-text" style="width:16px;height:16px"></i><span>Angebot</span>
          </button>
          <button class="btn btn-secondary btn-sm" onclick="app.exportEventToCalendar(${e.id})" title="In Kalender exportieren">
            <i data-lucide="calendar-plus" style="width:16px;height:16px"></i><span>Kalender</span>
          </button>
          <button class="btn btn-secondary btn-sm" onclick="app.sendEventEmail(${e.id})" title="Per E-Mail versenden">
            <i data-lucide="mail" style="width:16px;height:16px"></i><span>E-Mail</span>
          </button>
          <button class="btn btn-secondary btn-sm" onclick="app.shareEvent(${e.id})" title="Öffentlichen Link erstellen">
            <i data-lucide="share-2" style="width:16px;height:16px"></i><span>Teilen</span>
          </button>
          <button class="btn btn-secondary" onclick="app.editEvent(${e.id})">
            <i data-lucide="pencil" style="width:16px;height:16px"></i><span>Bearbeiten</span>
          </button>
          <button class="btn btn-ghost" onclick="app.deleteEvent(${e.id})">
            <i data-lucide="trash-2" style="width:16px;height:16px"></i>
          </button>
        </div>
      </div>

      <!-- TABS -->
      <div class="event-tabs" style="display:flex;flex-wrap:wrap;gap:var(--space-sm);margin-bottom:var(--space-lg);border-bottom:1px solid var(--c-border);padding-bottom:var(--space-sm)">
        <button class="btn btn-sm btn-secondary" onclick="app.navigate('#planner/${e.id}')">📍 Planung</button>
        <button class="btn btn-sm btn-ghost" onclick="app.navigate('#contacts/${e.id}')">👥 Kontakte</button>
        <button class="btn btn-sm btn-ghost" onclick="app.navigate('#equipment/${e.id}')">🎛️ Equipment</button>
        <button class="btn btn-sm btn-ghost" onclick="app.navigate('#calculation/${e.id}')">💰 Kalkulation</button>
      </div>

      <!-- LOCATIONS -->
      <div class="card mb-3">
        <div class="card-header">
          <div class="card-title"><i data-lucide="map-pin"></i>Locations</div>
          <button class="btn btn-sm btn-primary" onclick="app.addLocation()">
            <i data-lucide="plus" style="width:14px;height:14px"></i>Hinzufügen
          </button>
        </div>
        ${locations.length === 0 ? UI.emptyState('map-pin', 'Keine Locations', 'Füge die erste Location hinzu.') :
          this.renderLocations(locations)
        }
      </div>

      <!-- TIMELINE -->
      <div class="card mb-3">
        <div class="card-header">
          <div class="card-title"><i data-lucide="clock"></i>Tagesablauf</div>
          <button class="btn btn-sm btn-primary" onclick="app.addTimelineItem()">
            <i data-lucide="plus" style="width:14px;height:14px"></i>Hinzufügen
          </button>
        </div>
        ${this.renderTimeline(timeline)}
      </div>

      <!-- TODOS -->
      ${await this.renderEventTodos(this.currentEventId)}`;
  },

  renderLocations(locations) {
    return `<div class="location-list" style="display:flex;flex-direction:column;gap:var(--space-md)">
      ${locations.map((l, i) => `
        <div class="location-card" style="display:flex;gap:var(--space-md);padding:var(--space-md);background:var(--c-bg);border-radius:var(--radius-md);border:1px solid var(--c-border)">
          <div style="font-size:1.5rem;font-weight:800;color:var(--c-accent);min-width:36px;text-align:center">${i + 1}</div>
          <div style="flex:1">
            <div style="font-weight:700;font-size:1rem;margin-bottom:4px">${l.name}</div>
            <div class="text-muted" style="font-size:0.875rem;margin-bottom:8px">${l.address || ''}</div>
            <div style="display:flex;gap:var(--space-lg);font-size:0.8125rem">
              ${l.km ? `<span>🚗 ${l.km} km</span>` : ''}
              ${l.setupTime ? `<span>🔧 Aufbau: ${l.setupTime}</span>` : ''}
              ${l.soundcheck ? `<span>🎤 Soundcheck: ${l.soundcheck}</span>` : ''}
            </div>
            ${l.notes ? `<div class="text-muted mt-1" style="font-size:0.8125rem">📝 ${l.notes}</div>` : ''}
            ${l.contactName ? `<div class="text-muted mt-1" style="font-size:0.8125rem">👤 ${l.contactName}${l.contactPhone ? ' · ' + l.contactPhone : ''}</div>` : ''}
            ${l.address ? `
            <div class="maps-row">
              <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(l.address)}" target="_blank" rel="noopener" class="btn-map google"
                onclick="event.stopPropagation()">
                <i data-lucide="map-pin" style="width:12px;height:12px"></i> Google Maps
              </a>
              <a href="http://maps.apple.com/?q=${encodeURIComponent(l.address)}" target="_blank" rel="noopener" class="btn-map apple"
                onclick="event.stopPropagation()">
                <i data-lucide="navigation" style="width:12px;height:12px"></i> Apple Maps
              </a>
            </div>
            ` : ''}
          </div>
          <div style="display:flex;flex-direction:column;gap:4px">
            <button class="btn btn-icon btn-ghost" onclick="app.editLocation(${l.id})"><i data-lucide="pencil" style="width:14px;height:14px"></i></button>
            <button class="btn btn-icon btn-ghost" onclick="app.deleteLocation(${l.id})"><i data-lucide="trash-2" style="width:14px;height:14px"></i></button>
          </div>
        </div>
      `).join('')}
    </div>`;
  },

  renderTimeline(items) {
    if (items.length === 0) return UI.emptyState('clock', 'Kein Tagesablauf', 'Plane die einzelnen Positionen des Tages.');
    return `<div class="timeline">
      ${items.map(t => `
        <div class="timeline-item">
          <div class="timeline-dot ${t.done ? 'done' : ''}"></div>
          <div class="timeline-time">${t.time} Uhr</div>
          <div class="timeline-content">
            <div style="display:flex;justify-content:space-between;align-items:start">
              <div>
                <div class="timeline-title">${t.title}</div>
                <div class="timeline-desc">${t.detail || ''}${t.location ? ' · 📍 ' + t.location : ''}${t.duration ? ' · ⏱️ ' + t.duration : ''}${t.crew ? ' · 👤 ' + t.crew : ''}</div>
              </div>
              <div style="display:flex;gap:4px">
                <button class="btn btn-icon btn-ghost timeline-check" onclick="app.toggleTimelineDone(${t.id})" style="width:36px;height:36px;display:flex;align-items:center;justify-content:center" aria-label="Erledigt">
                  <i data-lucide="${t.done ? 'check-circle' : 'circle'}" style="width:22px;height:22px;color:${t.done ? 'var(--c-success)' : 'var(--c-text-3)'}"></i>
                </button>
                <button class="btn btn-icon btn-ghost" onclick="app.editTimelineItem(${t.id})"><i data-lucide="pencil" style="width:14px;height:14px"></i></button>
                <button class="btn btn-icon btn-ghost" onclick="app.deleteTimelineItem(${t.id})"><i data-lucide="trash-2" style="width:14px;height:14px"></i></button>
              </div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>`;
  },

  // ═══════════════════════════════════════════════
  // LOCATIONS CRUD
  // ═══════════════════════════════════════════════
  addLocation() {
    const fields = [
      { name: 'name', label: 'Name der Location', placeholder: 'z.B. Festhalle Rüsselsheim' },
      { name: 'address', label: 'Adresse', placeholder: 'Straße, PLZ Ort' },
      { name: 'km', label: 'Anfahrt (km)', type: 'number' },
      { name: 'setupTime', label: 'Aufbau-Zeit', placeholder: 'z.B. 14:00 - 16:00' },
      { name: 'soundcheck', label: 'Soundcheck', placeholder: 'z.B. 16:00 - 17:00' },
      { name: 'contactName', label: 'Kontakt vor Ort' },
      { name: 'contactPhone', label: 'Telefon' },
      { name: 'notes', label: 'Notizen', type: 'textarea' }
    ];
    UI.openModal('Location hinzufügen', `<form id="loc-form">${UI.form(fields)}</form>`, async () => {
      const data = UI.getFormData(document.getElementById('loc-form'));
      data.eventId = this.currentEventId;
      const existing = await db.locations.where('eventId').equals(this.currentEventId).count();
      data.sortOrder = existing + 1;
      await db.locations.add(data);
      UI.toast('Location hinzugefügt', 'success');
      this.navigate(`#planner/${this.currentEventId}`);
    });
  },

  async editLocation(id) {
    const l = await db.locations.get(id);
    const fields = [
      { name: 'name', label: 'Name' },
      { name: 'address', label: 'Adresse' },
      { name: 'km', label: 'Anfahrt (km)', type: 'number' },
      { name: 'setupTime', label: 'Aufbau-Zeit' },
      { name: 'soundcheck', label: 'Soundcheck' },
      { name: 'contactName', label: 'Kontakt' },
      { name: 'contactPhone', label: 'Telefon' },
      { name: 'notes', label: 'Notizen', type: 'textarea' }
    ];
    UI.openModal('Location bearbeiten', `<form id="edit-loc-form">${UI.form(fields, l)}</form>`, async () => {
      const data = UI.getFormData(document.getElementById('edit-loc-form'));
      await db.locations.update(id, data);
      UI.toast('Location aktualisiert', 'success');
      this.navigate(`#planner/${this.currentEventId}`);
    });
  },

  async deleteLocation(id) {
    UI.confirm('Location wirklich löschen?', async () => {
      await db.locations.delete(id);
      UI.toast('Location gelöscht', 'info');
      this.navigate(`#planner/${this.currentEventId}`);
    });
  },

  // ═══════════════════════════════════════════════
  // TIMELINE CRUD
  // ═══════════════════════════════════════════════
  addTimelineItem() {
    const fields = [
      { name: 'time', label: 'Uhrzeit', placeholder: 'z.B. 14:00' },
      { name: 'title', label: 'Position', placeholder: 'z.B. Soundcheck' },
      { name: 'detail', label: 'Details', placeholder: 'Beschreibung' },
      { name: 'location', label: 'Ort' },
      { name: 'duration', label: 'Dauer', placeholder: 'z.B. 1h' },
      { name: 'crew', label: 'Personal' }
    ];
    UI.openModal('Tagesablauf hinzufügen', `<form id="tl-form">${UI.form(fields)}</form>`, async () => {
      const data = UI.getFormData(document.getElementById('tl-form'));
      data.eventId = this.currentEventId;
      data.done = false;
      const existing = await db.timeline.where('eventId').equals(this.currentEventId).count();
      data.sortOrder = existing + 1;
      await db.timeline.add(data);
      UI.toast('Position hinzugefügt', 'success');
      this.navigate(`#planner/${this.currentEventId}`);
    });
  },

  async editTimelineItem(id) {
    const t = await db.timeline.get(id);
    const fields = [
      { name: 'time', label: 'Uhrzeit' },
      { name: 'title', label: 'Position' },
      { name: 'detail', label: 'Details' },
      { name: 'location', label: 'Ort' },
      { name: 'duration', label: 'Dauer' },
      { name: 'crew', label: 'Personal' }
    ];
    UI.openModal('Position bearbeiten', `<form id="edit-tl-form">${UI.form(fields, t)}</form>`, async () => {
      const data = UI.getFormData(document.getElementById('edit-tl-form'));
      await db.timeline.update(id, data);
      UI.toast('Aktualisiert', 'success');
      this.navigate(`#planner/${this.currentEventId}`);
    });
  },

  async toggleTimelineDone(id) {
    const scrollY = window.scrollY;
    const t = await db.timeline.get(id);
    await db.timeline.update(id, { done: !t.done });
    this.navigate(`#planner/${this.currentEventId}`);
    requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: 'instant' }));
  },

  async deleteTimelineItem(id) {
    const scrollY = window.scrollY;
    UI.confirm('Position löschen?', async () => {
      await db.timeline.delete(id);
      UI.toast('Gelöscht', 'info');
      this.navigate(`#planner/${this.currentEventId}`);
      requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: 'instant' }));
    });
  },

  // ═══════════════════════════════════════════════
  // CONTACTS
  // ═══════════════════════════════════════════════
  async renderContacts(eventId, search = '') {
    if (!eventId) {
      let events = await db.events.where('userId').equals(Auth.userId || 1).toArray();
      if (search) {
        events = events.filter(e =>
          (e.clientName || '').toLowerCase().includes(search) ||
          (e.eventType || '').toLowerCase().includes(search)
        );
      }
      return `
        <div class="page-header"><h1 class="page-title">Kontakte</h1></div>
        <p class="text-muted mb-2">Wähle einen Auftrag:</p>
        <div class="grid-2" id="contacts-list">${events.map(e => `
          <div class="card" style="cursor:pointer" onclick="app.navigate('#contacts/${e.id}')">
            <div style="font-weight:700">${e.clientName}</div>
            <div class="text-muted" style="font-size:0.875rem">${e.orderNumber} · ${UI.formatDate(e.date)}</div>
          </div>
        `).join('')}</div>`;
    }

    this.currentEventId = parseInt(eventId);
    const e = await db.events.get(this.currentEventId);
    let contacts = await db.contacts.where('eventId').equals(this.currentEventId).toArray();
    if (search) {
      contacts = contacts.filter(c =>
        (c.name || '').toLowerCase().includes(search) ||
        (c.role || '').toLowerCase().includes(search) ||
        (c.phone || '').toLowerCase().includes(search)
      );
    }

    return `
      <div class="page-header">
        <div>
          <div style="font-size:0.875rem;color:var(--c-text-3)">${e.orderNumber}</div>
          <h1 class="page-title">Kontakte: ${e.clientName}</h1>
        </div>
        <button class="btn btn-primary" onclick="app.addContact()"><i data-lucide="plus" style="width:16px;height:16px"></i>Kontakt</button>
      </div>

      <div class="event-tabs" style="display:flex;flex-wrap:wrap;gap:var(--space-sm);margin-bottom:var(--space-lg);border-bottom:1px solid var(--c-border);padding-bottom:var(--space-sm)">
        <button class="btn btn-sm btn-ghost" onclick="app.navigate('#planner/${e.id}')">📍 Planung</button>
        <button class="btn btn-sm btn-secondary" onclick="app.navigate('#contacts/${e.id}')">👥 Kontakte</button>
        <button class="btn btn-sm btn-ghost" onclick="app.navigate('#equipment/${e.id}')">🎛️ Equipment</button>
        <button class="btn btn-sm btn-ghost" onclick="app.navigate('#calculation/${e.id}')">💰 Kalkulation</button>
      </div>

      <div class="grid-2" id="contacts-list">
        ${contacts.length === 0 ? UI.emptyState('users', 'Keine Kontakte', 'Füge den ersten Ansprechpartner hinzu.') :
          contacts.map(c => `
            <div class="card">
              <div style="display:flex;justify-content:space-between;align-items:start">
                <div>
                  <div style="display:inline-block;background:var(--c-accent);color:white;font-size:0.75rem;font-weight:700;padding:2px 10px;border-radius:9999px;margin-bottom:8px">${c.role}</div>
                  <div style="font-weight:700;font-size:1.1rem">${c.name}</div>
                </div>
                <div style="display:flex;gap:4px">
                  <button class="btn btn-icon btn-ghost" onclick="app.editContact(${c.id})"><i data-lucide="pencil" style="width:14px;height:14px"></i></button>
                  <button class="btn btn-icon btn-ghost" onclick="app.deleteContact(${c.id})"><i data-lucide="trash-2" style="width:14px;height:14px"></i></button>
                </div>
              </div>
              <div style="margin-top:var(--space-sm);font-size:0.875rem;color:var(--c-text-2);display:flex;flex-direction:column;gap:4px">
                ${c.phone ? `<div>📞 <a href="tel:${c.phone}" style="color:var(--c-accent)">${c.phone}</a></div>` : ''}
                ${c.email ? `<div>✉️ <a href="mailto:${c.email}" style="color:var(--c-accent)">${c.email}</a></div>` : ''}
                ${c.responsibility ? `<div>🎯 ${c.responsibility}</div>` : ''}
                ${c.availability ? `<div>🕐 ${c.availability}</div>` : ''}
                ${c.notes ? `<div style="margin-top:4px;padding-top:4px;border-top:1px solid var(--c-border);color:var(--c-text-3);font-size:0.8125rem">📝 ${c.notes}</div>` : ''}
              </div>
            </div>
          `).join('')}
      </div>`;
  },

  addContact() {
    const fields = [
      { name: 'role', label: 'Rolle', placeholder: 'z.B. Brautpaar, Location-Kontakt, Catering' },
      { name: 'name', label: 'Name' },
      { name: 'phone', label: 'Telefon' },
      { name: 'email', label: 'E-Mail', type: 'email' },
      { name: 'responsibility', label: 'Zuständig für', placeholder: 'z.B. Vertrag, Zahlung, Schlüssel' },
      { name: 'availability', label: 'Erreichbarkeit', placeholder: 'z.B. Jederzeit, Mo-Fr 9-17h' },
      { name: 'notes', label: 'Notizen', type: 'textarea' }
    ];
    UI.openModal('Kontakt hinzufügen', `<form id="contact-form">${UI.form(fields)}</form>`, async () => {
      const data = UI.getFormData(document.getElementById('contact-form'));
      data.eventId = this.currentEventId;
      await db.contacts.add(data);
      UI.toast('Kontakt hinzugefügt', 'success');
      this.navigate(`#contacts/${this.currentEventId}`);
    });
  },

  async editContact(id) {
    const c = await db.contacts.get(id);
    const fields = [
      { name: 'role', label: 'Rolle' },
      { name: 'name', label: 'Name' },
      { name: 'phone', label: 'Telefon' },
      { name: 'email', label: 'E-Mail', type: 'email' },
      { name: 'responsibility', label: 'Zuständig für' },
      { name: 'availability', label: 'Erreichbarkeit' },
      { name: 'notes', label: 'Notizen', type: 'textarea' }
    ];
    UI.openModal('Kontakt bearbeiten', `<form id="edit-contact-form">${UI.form(fields, c)}</form>`, async () => {
      const data = UI.getFormData(document.getElementById('edit-contact-form'));
      await db.contacts.update(id, data);
      UI.toast('Kontakt aktualisiert', 'success');
      this.navigate(`#contacts/${this.currentEventId}`);
    });
  },

  async deleteContact(id) {
    UI.confirm('Kontakt löschen?', async () => {
      await db.contacts.delete(id);
      UI.toast('Kontakt gelöscht', 'info');
      this.navigate(`#contacts/${this.currentEventId}`);
    });
  },

  // ═══════════════════════════════════════════════
  // EQUIPMENT
  // ═══════════════════════════════════════════════
  async renderEquipment(eventId, search = '') {
    if (!eventId) {
      let events = await db.events.where('userId').equals(Auth.userId || 1).toArray();
      if (search) {
        events = events.filter(e =>
          (e.clientName || '').toLowerCase().includes(search) ||
          (e.eventType || '').toLowerCase().includes(search)
        );
      }
      return `
        <div class="page-header"><h1 class="page-title">Equipment</h1></div>
        <p class="text-muted mb-2">Wähle einen Auftrag:</p>
        <div class="grid-2" id="equipment-grid">${events.map(e => `
          <div class="card" style="cursor:pointer" onclick="app.navigate('#equipment/${e.id}')">
            <div style="font-weight:700">${e.clientName}</div>
            <div class="text-muted" style="font-size:0.875rem">${e.orderNumber} · ${UI.formatDate(e.date)}</div>
          </div>
        `).join('')}</div>`;
    }

    this.currentEventId = parseInt(eventId);
    const e = await db.events.get(this.currentEventId);
    let items = await db.equipmentItems.where('eventId').equals(this.currentEventId).toArray();

    if (search) {
      items = items.filter(i =>
        (i.name || '').toLowerCase().includes(search) ||
        (i.category || '').toLowerCase().includes(search)
      );
    }

    // Gruppiere nach Herkunft
    const ownItems = items.filter(i => !i.isExternal);
    const extItems = items.filter(i => i.isExternal);

    const groupByCat = arr => {
      const byCat = {};
      arr.forEach(item => {
        if (!byCat[item.category]) byCat[item.category] = [];
        byCat[item.category].push(item);
      });
      return byCat;
    };
    const byCatOwn = groupByCat(ownItems);
    const byCatExt = groupByCat(extItems);

    const totalNeeded = items.length;
    const totalPacked = items.filter(i => i.packed).length;
    const progress = totalNeeded > 0 ? Math.round((totalPacked / totalNeeded) * 100) : 0;

    // Pakete laden
    const packages = await db.equipmentPackages.where('userId').equals(Auth.userId || 1).toArray();

    const renderCatBlock = (byCat, title, badgeColor) => {
      if (Object.keys(byCat).length === 0) return '';
      return `
        <h3 style="font-size:1rem;margin:var(--space-lg) 0 var(--space-sm);display:flex;align-items:center;gap:8px">
          ${title}
          <span class="badge" style="background:${badgeColor};color:white;font-size:0.7rem">${Object.values(byCat).flat().length}</span>
        </h3>
        ${Object.keys(byCat).sort().map(cat => `
          <div class="card mb-2">
            <div class="card-header"><div class="card-title">${cat}</div></div>
            ${byCat[cat].map(item => `
              <div class="checklist-item">
                <input type="checkbox" id="eq-${item.id}" class="checklist-checkbox" ${item.packed ? 'checked' : ''} onchange="app.toggleEquipmentPacked(${item.id}, this.checked)" title="Gepackt">
                <label class="checklist-label ${item.packed ? 'checked' : ''}">
                  <span style="font-weight:600">${item.name}</span>
                  <span class="checklist-qty" style="color:var(--c-text-3);font-size:0.8125rem;margin-left:8px">×${item.qty}</span>
                  ${item.note ? `<span style="color:var(--c-text-3);font-size:0.8125rem;margin-left:8px">— ${item.note}</span>` : ''}
                  ${item.source === 'manual' ? `<span style="color:var(--c-warning);font-size:0.75rem;margin-left:6px">✎</span>` : ''}
                  ${item.sourceVendor || item.isExternal ? `<span style="color:var(--c-accent);font-size:0.75rem;margin-left:6px">${item.isExternal ? '🌐' : '🏢'} ${item.sourceVendor || 'Extern'}</span>` : ''}
                </label>
                <button class="btn btn-icon btn-ghost" onclick="app.editEquipmentQty(${item.id})" title="Anzahl ändern"><i data-lucide="pencil" style="width:14px;height:14px"></i></button>
                <button class="btn btn-icon btn-ghost" onclick="app.deleteEquipmentItem(${item.id})"><i data-lucide="trash-2" style="width:14px;height:14px"></i></button>
              </div>
            `).join('')}
          </div>
        `).join('')}`;
    };

    return `
      <div class="page-header">
        <div>
          <div style="font-size:0.875rem;color:var(--c-text-3)">${e.orderNumber}</div>
          <h1 class="page-title">Equipment: ${e.clientName}</h1>
        </div>
        <div style="text-align:right">
          <div style="font-size:1.5rem;font-weight:700;color:var(--c-success)"><span class="pack-progress-text">${progress}%</span></div>
          <div style="font-size:0.75rem;color:var(--c-text-3)"><span class="pack-packed-count">${totalPacked}</span>/<span class="pack-needed-count">${totalNeeded}</span> gepackt</div>
        </div>
      </div>

      <div class="event-tabs" style="display:flex;flex-wrap:wrap;gap:var(--space-sm);margin-bottom:var(--space-lg);border-bottom:1px solid var(--c-border);padding-bottom:var(--space-sm)">
        <button class="btn btn-sm btn-ghost" onclick="app.navigate('#planner/${e.id}')">📍 Planung</button>
        <button class="btn btn-sm btn-ghost" onclick="app.navigate('#contacts/${e.id}')">👥 Kontakte</button>
        <button class="btn btn-sm btn-secondary" onclick="app.navigate('#equipment/${e.id}')">🎛️ Equipment</button>
        <button class="btn btn-sm btn-ghost" onclick="app.navigate('#calculation/${e.id}')">💰 Kalkulation</button>
      </div>

      <div style="margin-bottom:var(--space-lg)">
        <div style="background:var(--c-bg);border-radius:var(--radius-md);height:8px;overflow:hidden">
          <div class="pack-progress-bar" style="width:${progress}%;height:100%;background:var(--c-success);transition:width 500ms ease"></div>
        </div>
      </div>

      <!-- Pakete & Aktionen -->
      <div style="display:flex;flex-wrap:wrap;gap:var(--space-sm);margin-bottom:var(--space-md);align-items:center">
        <button class="btn btn-sm btn-primary" onclick="app.addEquipmentItem()"><i data-lucide="plus" style="width:14px;height:14px"></i>Manuell</button>
        <button class="btn btn-sm btn-secondary" onclick="app.openCatalogPicker()">📦 Katalog</button>
        <div style="width:1px;height:24px;background:var(--c-border);margin:0 4px"></div>
        ${packages.map(pkg => `
          <button class="btn btn-sm btn-ghost" style="border:1px dashed var(--c-border)" onclick="app.addPackage('${pkg.name}')" title="${pkg.description}">
            + ${pkg.name}
          </button>
        `).join('')}
      </div>

      <!-- Eigene Geräte -->
      ${renderCatBlock(byCatOwn, '🔧 Eigene Geräte (TLS Lager)', 'var(--c-success)')}

      <!-- Externe Miete -->
      ${renderCatBlock(byCatExt, '📤 Externe Miete', 'var(--c-warning)')}

      <!-- Leer -->
      ${items.length === 0 ? UI.emptyState('package', 'Kein Equipment', 'Füge manuell hinzu, wähle aus dem Katalog oder klicke ein Paket oben.') : ''}
    `;
  },

  // ── Scroll-Restore Helper ──
  _restoreScroll(savedY) {
    requestAnimationFrame(() => {
      window.scrollTo({ top: savedY, behavior: 'instant' });
      // iOS Safari braucht manchmal einen zweiten Versuch
      setTimeout(() => window.scrollTo({ top: savedY, behavior: 'instant' }), 50);
    });
  },

  async toggleEquipmentNeeded(id, checked) {
    const savedY = window.scrollY;
    await db.equipmentItems.update(id, { needed: checked, packed: checked ? false : false });
    const btn = document.querySelector(`input[onchange*="toggleEquipmentNeeded(${id},"]`);
    if (!btn) { this._restoreScroll(savedY); return; }
    const row = btn.closest('.checklist-item');
    const label = row?.querySelector('.checklist-label');
    // Label-Style live togglen (durchgestrichen wenn NICHT needed)
    if (label) label.classList.toggle('checked', !checked);
    // "Packed" Checkbox ein-/ausblenden statt Re-Render
    if (row) {
      const packedCb = row.querySelector('input[type="checkbox"][title="Gepackt"]');
      if (packedCb) {
        packedCb.checked = false;
        packedCb.style.display = checked ? '' : 'none';
      }
      // Wenn !needed, auch den "extern" Badge ausblenden falls vorhanden
      if (!checked) {
        btn.checked = false;
      }
    }
    // Progress bar + counter live
    const totalNeeded = [...document.querySelectorAll('.checklist-item input[type=checkbox]:not([title="Gepackt"])')].filter(cb => cb.checked).length;
    const totalPacked = [...document.querySelectorAll('.checklist-item input[type=checkbox][title="Gepackt"]')].filter(cb => cb.checked && cb.offsetParent !== null).length;
    const percent = totalNeeded > 0 ? Math.round((totalPacked / totalNeeded) * 100) : 0;
    const progText = document.querySelector('.pack-progress-text');
    const progBar = document.querySelector('.pack-progress-bar');
    if (progText) progText.textContent = `${percent}%`;
    if (progBar) progBar.style.width = `${percent}%`;
    // Scroll-Position wiederherstellen
    this._restoreScroll(savedY);
  },

  async toggleEquipmentPacked(id, checked) {
    const savedY = window.scrollY;
    await db.equipmentItems.update(id, { packed: checked });
    const cb = document.querySelector(`input[id="eq-${id}"]`);
    if (cb) {
      cb.checked = checked;
      const label = cb.closest('.checklist-item')?.querySelector('.checklist-label');
      if (label) label.classList.toggle('checked', checked);
    }
    // Progress bar live — alle Items zählen als needed
    const totalItems = document.querySelectorAll('.checklist-item input[type=checkbox]').length;
    const totalPacked = [...document.querySelectorAll('.checklist-item input[type=checkbox]')].filter(c => c.checked).length;
    const percent = totalItems > 0 ? Math.round((totalPacked / totalItems) * 100) : 0;
    const progText = document.querySelector('.pack-progress-text');
    const progBar = document.querySelector('.pack-progress-bar');
    const packCount = document.querySelector('.pack-packed-count');
    const needCount = document.querySelector('.pack-needed-count');
    if (progText) progText.textContent = `${percent}%`;
    if (progBar) progBar.style.width = `${percent}%`;
    if (packCount) packCount.textContent = totalPacked;
    if (needCount) needCount.textContent = totalItems;
    // Scroll-Position wiederherstellen
    this._restoreScroll(savedY);
  },

  async deleteEquipmentItem(id) {
    const scrollY = window.scrollY;
    UI.confirm('Equipment-Position löschen?', async () => {
      await db.equipmentItems.delete(id);
      UI.toast('Gelöscht', 'info');
      // Lösche die DOM-Zeile direkt statt full re-render
      const row = document.querySelector(`button[onclick*="deleteEquipmentItem(${id}"]`).closest('.checklist-item');
      if (row) {
        row.remove();
        // Progress aktualisieren
        const totalItems = document.querySelectorAll('.checklist-item input[type=checkbox]').length;
        const totalPacked = [...document.querySelectorAll('.checklist-item input[type=checkbox]')].filter(c => c.checked).length;
        const percent = totalItems > 0 ? Math.round((totalPacked / totalItems) * 100) : 0;
        const progText = document.querySelector('.pack-progress-text');
        const progBar = document.querySelector('.pack-progress-bar');
        const packCount = document.querySelector('.pack-packed-count');
        const needCount = document.querySelector('.pack-needed-count');
        if (progText) progText.textContent = `${percent}%`;
        if (progBar) progBar.style.width = `${percent}%`;
        if (packCount) packCount.textContent = totalPacked;
        if (needCount) needCount.textContent = totalItems;
      } else {
        this.navigate(`#equipment/${this.currentEventId}`);
        requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: 'instant' }));
      }
    });
  },

  /* ── Equipment Qty inline edit ── */
  async editEquipmentQty(id) {
    const savedY = window.scrollY;
    const item = await db.equipmentItems.get(id);
    if (!item) return;
    const currentQty = item.qty || 1;

    UI.openModal('Anzahl ändern', `
      <div style="text-align:center;padding:var(--space-lg)">
        <div class="form-label" style="font-size:1.1rem;margin-bottom:var(--space-xl);font-weight:600">${item.name}</div>
        <div style="display:flex;align-items:center;justify-content:center;gap:var(--space-lg)">
          <button type="button" class="btn btn-secondary" style="width:64px;height:64px;font-size:1.75rem;border-radius:var(--radius-md);display:flex;align-items:center;justify-content:center" onclick="app._stepQty(-1)">−</button>
          <div id="qty-display" style="font-size:2.25rem;font-weight:800;min-width:80px;color:var(--c-text)">${currentQty}</div>
          <input type="hidden" id="qty-value" value="${currentQty}">
          <button type="button" class="btn btn-secondary" style="width:64px;height:64px;font-size:1.75rem;border-radius:var(--radius-md);display:flex;align-items:center;justify-content:center" onclick="app._stepQty(1)">+</button>
        </div>
      </div>
    `, async () => {
      const newQty = parseInt(document.getElementById('qty-value').value, 10) || 1;
      await db.equipmentItems.update(id, { qty: newQty });
      // DOM live updaten statt Re-Render
      const row = document.querySelector(`button[onclick*="editEquipmentQty(${id}"]`).closest('.checklist-item');
      if (row) {
        const qtySpan = row.querySelector('.checklist-qty');
        if (qtySpan) qtySpan.textContent = `×${newQty}`;
      }
      UI.toast('Anzahl aktualisiert', 'success');
      this._restoreScroll(savedY);
    });
  },

  _stepQty(delta) {
    const inp = document.getElementById('qty-value');
    const disp = document.getElementById('qty-display');
    if (!inp || !disp) return;
    let v = parseInt(inp.value, 10) || 0;
    v = Math.max(0, v + delta);
    inp.value = v;
    disp.textContent = v;
  },

  async autoFillEquipment() {
    // Veraltet — jetzt über openCatalogPicker()
    this.openCatalogPicker();
  },

  addEquipmentItem() {
    const fields = [
      { name: 'category', label: 'Kategorie', placeholder: 'z.B. Mikrofone, Kabel' },
      { name: 'name', label: 'Bezeichnung', placeholder: 'z.B. Shure SM58' },
      { name: 'qty', label: 'Anzahl', type: 'number', placeholder: '1' },
      { name: 'isExternal', label: 'Externe Miete?', type: 'checkbox' },
      { name: 'sourceVendor', label: 'Herkunft / Anbieter', placeholder: 'z.B. Thomann Verleih, StagePro Frankfurt' },
      { name: 'note', label: 'Notiz', placeholder: 'z.B. Batterien prüfen' }
    ];
    UI.openModal('Equipment hinzufügen', `<form id="eq-form">${UI.form(fields)}</form>`, async () => {
      const data = UI.getFormData(document.getElementById('eq-form'));
      data.eventId = this.currentEventId;
      data.needed = true;
      data.packed = false;
      data.source = 'manual';
      await db.equipmentItems.add(data);
      UI.toast('Hinzugefügt', 'success');
      this.navigate(`#equipment/${this.currentEventId}`);
    });
  },

  /* ── Pakete hinzufügen ── */
  async addPackage(packageName) {
    const pkg = await db.equipmentPackages.where('name').equals(packageName).first();
    if (!pkg) return;

    const catalog = await db.equipmentCatalog.where('userId').equals(Auth.userId || 1).toArray();
    const catalogMap = new Map(catalog.map(c => [c.name, c]));
    const existing = await db.equipmentItems.where('eventId').equals(this.currentEventId).toArray();
    const existingMap = new Map(existing.map(e => [e.name, e]));

    let matches = [];
    // Neue Item-basierte Pakete
    if (pkg.items && Array.isArray(pkg.items) && pkg.items.length > 0) {
      for (const it of pkg.items) {
        const cat = catalogMap.get(it.name);
        if (cat) matches.push({ ...cat, _pkgQty: it.qty || 1 });
      }
    } else {
      // Legacy: Tag-basiert
      const pkgTags = new Set(pkg.tags);
      matches = catalog.filter(item => item.tags && item.tags.some(tag => pkgTags.has(tag)));
    }

    let added = 0;
    for (const item of matches) {
      const qty = item._pkgQty || 1;
      const existingItem = existingMap.get(item.name);
      if (existingItem) {
        // Update qty instead of skipping
        await db.equipmentItems.update(existingItem.id, { qty: existingItem.qty + qty });
        added++;
        continue;
      }
      // Bestands-Check
      let canAdd = true;
      if (!item.isExternal && item.stock < 999) {
        const conflict = await this.checkStockConflict(item, qty, this.currentEventId);
        if (conflict.conflict) {
          UI.toast(`⚠️ "${item.name}" nicht hinzugefügt – Lager leer (${conflict.available}/${conflict.stock} verfügbar)`, 'warning', 4000);
          canAdd = false;
        }
      }
      if (canAdd) {
        await db.equipmentItems.add({
          eventId: this.currentEventId,
          category: item.category,
          name: item.name,
          qty: qty,
          needed: true,
          packed: false,
          note: `Paket: ${pkg.name}`,
          source: 'package',
          isExternal: !!item.isExternal,
          priceDay: item.priceDay || 0
        });
        added++;
      }
    }

    UI.toast(`${added} Positionen aus "${pkg.name}" hinzugefügt`, 'success');
    this.navigate(`#equipment/${this.currentEventId}`);
  },

  // ═══════════════════════════════════════════════
  // CALCULATION
  // ═══════════════════════════════════════════════
  async renderCalculation(eventId) {
    if (!eventId) {
      const events = await db.events.where('userId').equals(Auth.userId || 1).toArray();
      return `
        <div class="page-header"><h1 class="page-title">Kalkulation</h1></div>
        <p class="text-muted mb-2">Wähle einen Auftrag:</p>
        <div class="grid-2">${events.map(e => `
          <div class="card" style="cursor:pointer" onclick="app.navigate('#calculation/${e.id}')">
            <div style="font-weight:700">${e.clientName}</div>
            <div class="text-muted" style="font-size:0.875rem">${e.orderNumber} · ${UI.formatDate(e.date)}</div>
            <div style="margin-top:4px;font-weight:700;color:var(--c-accent)">${UI.euro(e.totalPrice || 0)}</div>
          </div>
        `).join('')}</div>`;
    }

    this.currentEventId = parseInt(eventId);
    const e = await db.events.get(this.currentEventId);
    const items = await db.equipmentItems.where('eventId').equals(this.currentEventId).toArray();
    const catalog = await db.equipmentCatalog.where('userId').equals(Auth.userId || 1).toArray();
    const payments = await db.payments.where('eventId').equals(this.currentEventId).toArray();

    // Calculate equipment costs
    const catMap = {};
    catalog.forEach(c => catMap[c.name] = c);

    let equipmentTotal = 0;
    const equipmentLines = [];
    items.filter(i => i.needed).forEach(item => {
      const catItem = catMap[item.name];
      const price = catItem ? (catItem.priceDay * item.qty * (e.duration || 1)) : 0;
      equipmentTotal += price;
      equipmentLines.push({ name: item.name, qty: item.qty, unit: catItem?.unit || 'Stk', price, pricePerDay: catItem?.priceDay || 0 });
    });

    // Personnel from database (editable)
    let personnel = await db.eventPersonnel.where('eventId').equals(this.currentEventId).toArray();
    // Fallback for old events without personnel data
    if (personnel.length === 0) {
      if (e.orderType !== 'rental') {
        personnel = [
          { eventId: this.currentEventId, role: 'Haupttechniker (Sound/Licht)', qty: 1, unit: 'Pauschale', price: 650, needed: true, sortOrder: 1 },
          { eventId: this.currentEventId, role: 'Hilfskraft (Aufbau/Abbau)', qty: 1, unit: 'Pauschale', price: 200, needed: true, sortOrder: 2 },
          { eventId: this.currentEventId, role: 'Anfahrt', qty: e.km || 0, unit: 'km', price: 0.70, needed: true, sortOrder: 3 },
          { eventId: this.currentEventId, role: 'Verpflegung', qty: 2, unit: 'Pers.', price: 25, needed: true, sortOrder: 4 }
        ];
      } else {
        personnel = [
          { eventId: this.currentEventId, role: 'Anfahrt / Lieferung', qty: e.km || 0, unit: 'km', price: 0.70, needed: true, sortOrder: 1 }
        ];
      }
      await db.eventPersonnel.bulkAdd(personnel);
    }
    const personnelTotal = personnel.reduce((s, p) => s + (p.needed ? p.price * p.qty : 0), 0);

    const netTotal = equipmentTotal + personnelTotal;
    const vat = netTotal * 0.19;
    const grossTotal = netTotal + vat;

    // Verleih-Modus Label
    const orderLabel = e.orderType === 'rental' ? '📦 Verleih' : '🎉 Event';

    return `
      <div class="page-header">
        <div>
          <div style="font-size:0.875rem;color:var(--c-text-3)">${e.orderNumber} · ${orderLabel}</div>
          <h1 class="page-title">Kalkulation: ${e.clientName}</h1>
        </div>
        <div style="text-align:right">
          <div style="font-size:1.75rem;font-weight:700;color:var(--c-accent)">${UI.euro(grossTotal)}</div>
          <div style="font-size:0.75rem;color:var(--c-text-3)">Gesamt brutto</div>
        </div>
      </div>

      <div class="event-tabs" style="display:flex;flex-wrap:wrap;gap:var(--space-sm);margin-bottom:var(--space-lg);border-bottom:1px solid var(--c-border);padding-bottom:var(--space-sm)">
        <button class="btn btn-sm btn-ghost" onclick="app.navigate('#planner/${e.id}')">📍 Planung</button>
        <button class="btn btn-sm btn-ghost" onclick="app.navigate('#contacts/${e.id}')">👥 Kontakte</button>
        <button class="btn btn-sm btn-ghost" onclick="app.navigate('#equipment/${e.id}')">🎛️ Equipment</button>
        ${e.orderType !== 'rental' ? `<button class="btn btn-sm btn-ghost" onclick="app.navigate('#personnel/${e.id}')">👤 Personal</button>` : ''}
        <button class="btn btn-sm btn-secondary" onclick="app.navigate('#calculation/${e.id}')">💰 Kalkulation</button>
      </div>

      <div class="grid-2">
        <!-- EQUIPMENT -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">🎛️ Equipment-Miete</div>
            <div style="font-weight:700;color:var(--c-accent)">${UI.euro(equipmentTotal)}</div>
          </div>
          <table class="data-table" style="font-size:0.8125rem">
            <thead><tr><th>Equipment</th><th>Anz.</th><th>Einheit</th><th style="text-align:right">Preis</th></tr></thead>
            <tbody>
              ${equipmentLines.map(l => `
                <tr>
                  <td>${l.name}</td>
                  <td>${l.qty}</td>
                  <td>${l.unit}</td>
                  <td style="text-align:right">${UI.euro(l.price)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <!-- PERSONNEL -->
        <div class="card">
          <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <div class="card-title">${e.orderType === 'rental' ? '🚚 Lieferung & Service' : '👤 Personal & Service'}</div>
            </div>
            <div style="font-weight:700;color:var(--c-accent)">${UI.euro(personnelTotal)}</div>
          </div>
          <table class="data-table" style="font-size:0.8125rem">
            <thead><tr><th>Position</th><th>Anz.</th><th>Einheit</th><th style="text-align:right">Preis</th></tr></thead>
            <tbody>
              ${personnel.map(p => `
                <tr style="${!p.needed ? 'opacity:0.45;text-decoration:line-through' : ''}">
                  <td>${p.role}</td>
                  <td>${p.qty}</td>
                  <td>${p.unit}</td>
                  <td style="text-align:right">${UI.euro(p.needed ? p.price * p.qty : 0)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          ${e.orderType !== 'rental' ? `<div style="padding:var(--space-sm);border-top:1px solid var(--c-border)"><button class="btn btn-sm btn-ghost" onclick="app.editPersonnel()"><i data-lucide="pencil" style="width:14px;height:14px"></i> Personal bearbeiten</button></div>` : ''}
        </div>
      </div>

      <!-- TOTALS -->
      <div class="card mt-3">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-lg)">
          <div>
            <div style="display:flex;justify-content:space-between;padding:var(--space-sm) 0;border-bottom:1px solid var(--c-border)">
              <span>Equipment</span><span>${UI.euro(equipmentTotal)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:var(--space-sm) 0;border-bottom:1px solid var(--c-border)">
              <span>Personal & Service</span><span>${UI.euro(personnelTotal)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:var(--space-sm) 0;border-bottom:1px solid var(--c-border);font-weight:700">
              <span>Zwischensumme NETTO</span><span>${UI.euro(netTotal)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:var(--space-sm) 0;border-bottom:1px solid var(--c-border)">
              <span>MwSt. (19%)</span><span>${UI.euro(vat)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:var(--space-md) 0;font-size:1.25rem;font-weight:700;color:var(--c-accent)">
              <span>GESAMT BRUTTO</span><span>${UI.euro(grossTotal)}</span>
            </div>
          </div>

          <!-- PAYMENTS -->
          <div>
            <div class="card-header" style="padding:0;margin-bottom:var(--space-md)">
              <div class="card-title">💳 Zahlungsplan</div>
            </div>
            ${payments.length === 0 ? '<p class="text-muted">Kein Zahlungsplan.</p>' : payments.map((p, i) => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:var(--space-sm) 0;border-bottom:1px solid var(--c-border)">
                <div>
                  <div style="font-weight:600">${p.type}</div>
                  <div style="font-size:0.75rem;color:var(--c-text-3)">${p.dueDate}</div>
                </div>
                <div style="text-align:right">
                  <div style="font-weight:700">${UI.euro(p.amount)}</div>
                  <div class="badge badge-${p.status === 'erhalten' ? 'confirmed' : p.status === 'offen' ? 'offer' : 'done'}" style="font-size:0.625rem">${p.status}</div>
                </div>
              </div>
            `).join('')}
            <div style="display:flex;justify-content:space-between;padding:var(--space-md) 0;font-weight:700">
              <span>Summe Zahlungen</span>
              <span>${UI.euro(payments.reduce((s,p) => s + p.amount, 0))}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  // ═══════════════════════════════════════════════
  // MARKET PRICES
  // ═══════════════════════════════════════════════
  renderMarket() {
    const prices = [
      { name: 'SQ6 + Waves (Tag)', tls: 115, market: '100-130 €', source: 'Thomann Verleih' },
      { name: 'ICOA 12 Pro A (Paar/Tag)', tls: 48, market: '40-60 €', source: 'Thomann Verleih' },
      { name: 'Doppel-18" Sub (Paar/Tag)', tls: 85, market: '70-100 €', source: 'StagePro Frankfurt' },
      { name: 'LED Washer (Stk/Tag)', tls: 3, market: '2-5 €', source: 'Knappe Rental' },
      { name: 'Shure SM58 (Stk/Tag)', tls: 3.50, market: '3-6 €', source: 'Thomann Verleih' },
      { name: 'Funkmikrofon-Set (Set/Tag)', tls: 25, market: '20-35 €', source: 'Knappe Rental' },
      { name: 'Haupttechniker 10-12h', tls: 650, market: '500-900 €', source: 'eventinc.de' },
      { name: 'Hilfskraft', tls: 200, market: '150-250 €', source: 'VT-Gruppen' },
      { name: 'DJ + Technik (Komplett)', tls: 800, market: '800-2000 €', source: 'eventpeppers' },
      { name: 'Wedding-PA klein', tls: '1000-1500', market: '900-1800 €', source: 'Markt' },
      { name: 'Wedding-PA mittel', tls: '1500-2200', market: '1400-2500 €', source: 'Markt' },
      { name: 'Wedding-PA groß', tls: '2200-3500', market: '2000-4000 €', source: 'Markt' }
    ];

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">Marktpreise</h1>
          <p class="page-subtitle">Preisorientierung für deine Angebote</p>
        </div>
      </div>

      <div class="card">
        <table class="data-table">
          <thead>
            <tr>
              <th>Position</th>
              <th>TLS-Preis</th>
              <th>Markt-Spanne</th>
              <th>Quelle</th>
            </tr>
          </thead>
          <tbody>
            ${prices.map(p => `
              <tr>
                <td><strong>${p.name}</strong></td>
                <td style="color:var(--c-accent);font-weight:600">${typeof p.tls === 'number' ? p.tls + ' €' : p.tls + ' €'}</td>
                <td>${p.market}</td>
                <td style="color:var(--c-text-3);font-size:0.8125rem">${p.source}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  // ═══════════════════════════════════════════════
  // OPEN EVENT DETAIL
  // ═══════════════════════════════════════════════
  openEvent(id) {
    this.navigate(`#planner/${id}`);
  },

  // ═══════════════════════════════════════════════
  // PDF EXPORT
  // ═══════════════════════════════════════════════
  exportPDF() {
    // Add print class to body for one event
    document.body.classList.add('printing');
    window.print();
    document.body.classList.remove('printing');
  },

  // ═══════════════════════════════════════════════
  // SHARE LINK GENERATOR (sicheres Public-Token)
  // ═══════════════════════════════════════════════
  async shareEvent(eventId) {
    const e = await db.events.get(eventId);
    if (!e) return;
    const publicToken = btoa(encodeURIComponent(JSON.stringify({
      id: eventId,
      n: e.orderNumber,
      c: e.clientName,
      d: e.date,
      t: Date.now()     // timestamp for versioning
    }))).replace(/[+/=]/g, '-');  // URL-safe

    const baseUrl = window.location.href.split('#')[0];
    const shareUrl = `${baseUrl}#share/${publicToken}`;

    // Copy to clipboard
    try { await navigator.clipboard.writeText(shareUrl); } catch (_) {}

    UI.openModal('🔗 Teilen', `
      <div style="display:flex;flex-direction:column;gap:var(--space-md);text-align:center">
        <p class="text-muted">Dieser Link zeigt das Event öffentlich – ohne Bearbeiten:</p>
        <div class="card" style="background:var(--c-bg);font-family:monospace;font-size:0.8125rem;word-break:break-all;user-select:all;padding:var(--space-md)"
        onclick="navigator.clipboard.writeText('${shareUrl}');UI.toast('Kopiert','success')" title="Klicken zum Kopieren">
          ${shareUrl}
        </div>
        <div class="text-muted" style="font-size:0.75rem">⚠️ Jeder mit dem Link kann die Planung ansehen. Link enthält keine Zugangsdaten.</div>
      </div>`, null, 'Schließen');
  },

  async renderShare(token) {
    try {
      const decoded = JSON.parse(decodeURIComponent(atob(token.replace(/-/g, '+'))));
      if (!decoded.id) throw new Error('Invalid token');

      const e = await db.events.get(decoded.id);
      if (!e) return `<div class="share-preview">
        <div class="share-header">
          <div class="share-brand">TLS Event Manager</div>
          <div class="share-sub">Dieser Link ist ungültig oder abgelaufen.</div>
        </div>
      </div>`;

      const locations = await db.locations.where('eventId').equals(e.id).toArray();
      const timeline = await db.timeline.where('eventId').equals(e.id).sortBy('time');
      const contacts = await db.contacts.where('eventId').equals(e.id).toArray();

      return `<div class="share-preview">
        <div class="share-header">
          <div class="share-brand">TLS Live Sound</div>
          <div class="share-sub">Veranstaltungsplanung · Timon Letschert</div>
        </div>

        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:start;flex-wrap:wrap;gap:var(--space-md)">
            <div>
              <div class="text-muted" style="font-size:0.75rem">${e.orderNumber}</div>
              <h1 style="font-size:1.5rem;font-weight:800">${e.clientName}</h1>
              <div style="display:flex;gap:var(--space-sm);flex-wrap:wrap;margin-top:var(--space-xs)">
                <span class="status-badge status-${e.status}">${e.status}</span>
                <span style="color:var(--c-text-2);font-size:0.875rem">${e.eventType}</span>
                <span style="color:var(--c-text-2);font-size:0.875rem">${e.personCount || '-'} Pers.</span>
              </div>
            </div>
            <div style="text-align:right">
              <div style="font-size:1.5rem;font-weight:700;color:var(--c-accent)">${UI.formatDate(e.date)}</div>
              <div style="font-size:0.875rem;color:var(--c-text-2)">${e.startTime || ''} ${e.endTime ? '- ' + e.endTime : ''}</div>
            </div>
          </div>
        </div>

        ${locations.length > 0 ? `
          <div class="card">
            <h3 style="margin-bottom:var(--space-md);font-size:1rem">📍 Locations</h3>
            ${locations.map((l,i) => `
              <div style="display:flex;gap:var(--space-md);padding:var(--space-md) 0;border-bottom:1px solid var(--c-border)">
                <div style="font-size:1.25rem;font-weight:800;color:var(--c-accent)">${i+1}</div>
                <div style="flex:1">
                  <div style="font-weight:700">${l.name}</div>
                  <div class="text-muted" style="font-size:0.875rem">${l.address || ''}</div>
                  ${l.setupTime ? `<div style="font-size:0.8125rem;margin-top:4px">🔧 Aufbau: ${l.setupTime}</div>` : ''}
                  ${l.soundcheck ? `<div style="font-size:0.8125rem">🎤 Soundcheck: ${l.soundcheck}</div>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}

        ${timeline.length > 0 ? `
          <div class="card">
            <h3 style="margin-bottom:var(--space-md);font-size:1rem">📅 Tagesablauf</h3>
            <div class="timeline">${timeline.map(t => `
              <div class="timeline-item">
                <div class="timeline-dot ${t.done ? 'done' : ''}"></div>
                <div class="timeline-time">${t.time}</div>
                <div class="timeline-content">
                  <div class="timeline-title">${t.title}</div>
                  <div class="timeline-desc">${t.detail || ''}${t.location ? ' · 📍 ' + t.location : ''}${t.duration ? ' · ⏱️ ' + t.duration : ''}</div>
                </div>
              </div>
            `).join('')}</div>
          </div>
        ` : ''}

        ${contacts.length > 0 ? `
          <div class="card">
            <h3 style="margin-bottom:var(--space-md);font-size:1rem">👥 Kontakte</h3>
            <div class="grid-2" style="gap:var(--space-sm)">${contacts.map(c => `
              <div style="padding:var(--space-md);border:1px solid var(--c-border);border-radius:var(--radius-md)">
                <div style="display:inline-block;background:var(--c-accent);color:white;font-size:0.7rem;font-weight:700;padding:2px 8px;border-radius:9999px;margin-bottom:6px">${c.role}</div>
                <div style="font-weight:700">${c.name}</div>
                ${c.phone ? `<div style="font-size:0.8125rem;color:var(--c-text-2)">📞 ${c.phone}</div>` : ''}
                ${c.email ? `<div style="font-size:0.8125rem;color:var(--c-text-2)">✉️ ${c.email}</div>` : ''}
              </div>
            `).join('')}</div>
          </div>
        ` : ''}

        <div class="share-watermark">TLS Event Manager · Freigegeben für ${e.clientName}</div>
      </div>`;
    } catch (_) {
      return `<div class="share-preview">
        <div class="share-header">
          <div class="share-brand">TLS Event Manager</div>
          <div class="share-sub">Ungültiger oder abgelaufener Link.</div>
        </div>
      </div>`;
    }
  },

  // ═══════════════════════════════════════════════
  // LOCK SCREEN (App-Passwort)
  // ═══════════════════════════════════════════════
  async setPassword() {
    Auth.showPasswordChange();
  },

  // ═══════════════════════════════════════════════
  // ADMIN: CREATE USER
  // ═══════════════════════════════════════════════
  showCreateUser() {
    if (!Auth.isAdmin()) {
      UI.toast('Nur Admins können Benutzer erstellen.', 'error');
      return;
    }
    UI.openModal('Neuen Benutzer erstellen', `
      <form id="create-user-form">
        <div class="form-group">
          <label class="form-label">Benutzername</label>
          <input type="text" class="form-input" id="new-username" required placeholder="z.B. Max">
        </div>
        <div class="form-group">
          <label class="form-label">Passwort</label>
          <input type="password" class="form-input" id="new-password" required minlength="6" placeholder="Mindestens 6 Zeichen">
        </div>
        <div class="form-group">
          <label class="form-label">Passwort wiederholen</label>
          <input type="password" class="form-input" id="new-password-confirm" required placeholder="Passwort wiederholen">
        </div>
        <div id="create-user-error" style="color:var(--c-danger);font-size:0.85rem;display:none;margin-top:var(--space-sm)"></div>
      </form>
    `, async () => {
      const username = document.getElementById('new-username').value.trim();
      const password = document.getElementById('new-password').value;
      const confirm = document.getElementById('new-password-confirm').value;
      const errEl = document.getElementById('create-user-error');

      if (!username || !password) {
        errEl.textContent = 'Benutzername und Passwort sind erforderlich.';
        errEl.style.display = 'block';
        throw new Error('empty');
      }
      if (password !== confirm) {
        errEl.textContent = 'Passwörter stimmen nicht überein.';
        errEl.style.display = 'block';
        throw new Error('mismatch');
      }
      if (password.length < 6) {
        errEl.textContent = 'Passwort muss mindestens 6 Zeichen haben.';
        errEl.style.display = 'block';
        throw new Error('too_short');
      }

      try {
        const id = await Auth.createUser(username, password);
        UI.toast('Benutzer "' + username + '" erstellt (ID: ' + id + ')', 'success');
      } catch (err) {
        errEl.textContent = err.message;
        errEl.style.display = 'block';
        throw err;
      }
    }, 'Benutzer erstellen');
  },

  // ═══════════════════════════════════════════════
  // EXPORT / IMPORT
  // ═══════════════════════════════════════════════
  async exportData() {
    if (API.token) {
      try {
        const data = await API.export.full();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `TLS-Backup-${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        UI.toast('Server-Backup exportiert', 'success');
        return;
      } catch (e) { console.warn('API export failed, falling back to local:', e.message); }
    }
    // Fallback local export (existing code)
    const userEventIds = (await db.events.where('userId').equals(Auth.userId || 1).toArray()).map(e => e.id);
    const data = {
      events: await db.events.where('userId').equals(Auth.userId || 1).toArray(),
      locations: (await db.locations.toArray()).filter(l => userEventIds.includes(l.eventId)),
      contacts: (await db.contacts.toArray()).filter(c => userEventIds.includes(c.eventId)),
      timeline: (await db.timeline.toArray()).filter(t => userEventIds.includes(t.eventId)),
      equipmentItems: (await db.equipmentItems.toArray()).filter(it => userEventIds.includes(it.eventId)),
      equipmentCatalog: await db.equipmentCatalog.where('userId').equals(Auth.userId || 1).toArray(),
      equipmentPackages: await db.equipmentPackages.where('userId').equals(Auth.userId || 1).toArray(),
      payments: (await db.payments.toArray()).filter(p => userEventIds.includes(p.eventId)),
      eventTodos: (await db.eventTodos.toArray()).filter(t => userEventIds.includes(t.eventId)),
      eventPersonnel: (await db.eventPersonnel.toArray()).filter(p => userEventIds.includes(p.eventId)),
      settings: await db.settings.where('userId').equals(Auth.userId || 1).toArray(),
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TLS-Backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    UI.toast('Daten exportiert', 'success');
  },

  async importData() {
    const uid = Auth.userId || 1;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      try {
        const data = JSON.parse(text);

        if (API.token) {
          try {
            await API.import.full(data);
            // After server import, pull all data back via full sync
            await API.sync.all();
            UI.toast('Daten auf Server importiert', 'success');
            this.navigate('#dashboard');
            return;
          } catch (serverErr) {
            console.warn('Server import failed, falling back to local:', serverErr.message);
          }
        }

        // Delete only current user's data
        const userEvents = await db.events.where('userId').equals(uid).toArray();
        const userEventIds = userEvents.map(ev => ev.id);
        for (const eid of userEventIds) {
          await db.locations.where('eventId').equals(eid).delete();
          await db.contacts.where('eventId').equals(eid).delete();
          await db.timeline.where('eventId').equals(eid).delete();
          await db.equipmentItems.where('eventId').equals(eid).delete();
          await db.payments.where('eventId').equals(eid).delete();
          await db.eventTodos.where('eventId').equals(eid).delete();
          await db.eventPersonnel.where('eventId').equals(eid).delete();
        }
        await db.events.where('userId').equals(uid).delete();
        await db.equipmentCatalog.where('userId').equals(uid).delete();
        await db.equipmentPackages.where('userId').equals(uid).delete();
        // Normalize snake_case → camelCase (handles server exports as well as local exports)
        const normalizeKeys = (obj) => {
          if (Array.isArray(obj)) return obj.map(normalizeKeys);
          if (typeof obj !== 'object' || obj === null) return obj;
          const out = {};
          for (const [k, v] of Object.entries(obj)) {
            const camel = k.replace(/_([a-z])/g, (_, g1) => g1.toUpperCase());
            out[camel] = Array.isArray(v) ? v.map(normalizeKeys) : v;
          }
          return out;
        };
        ['events','locations','contacts','timeline','equipmentItems','equipmentCatalog','equipmentPackages','payments','eventTodos','eventPersonnel','settings'].forEach(t => {
          if (data[t]) data[t] = normalizeKeys(data[t]);
        });
        if (data.equipmentItems) {
          for (const it of data.equipmentItems) {
            if (it.price !== undefined && it.priceDay === undefined) it.priceDay = it.price;
          }
        }

        // Import with userId stamped
        if (data.events) { for (const ev of data.events) { ev.userId = uid; ev.synced = 1; } await db.events.bulkPut(data.events); }
        if (data.equipmentPackages) { for (const p of data.equipmentPackages) p.userId = uid; await db.equipmentPackages.bulkPut(data.equipmentPackages); }
        if (data.eventPersonnel) { for (const p of data.eventPersonnel) p.userId = uid; await db.eventPersonnel.bulkPut(data.eventPersonnel); }
        if (data.settings) { for (const s of data.settings) s.userId = uid; await db.settings.bulkPut(data.settings); }
        if (data.locations) { for (const l of data.locations) l.userId = uid; await db.locations.bulkPut(data.locations); }
        if (data.contacts) { for (const c of data.contacts) c.userId = uid; await db.contacts.bulkPut(data.contacts); }
        if (data.timeline) { for (const t of data.timeline) t.userId = uid; await db.timeline.bulkPut(data.timeline); }
        if (data.equipmentItems) { for (const it of data.equipmentItems) it.userId = uid; await db.equipmentItems.bulkPut(data.equipmentItems); }
        if (data.equipmentCatalog) { for (const c of data.equipmentCatalog) c.userId = uid; await db.equipmentCatalog.bulkPut(data.equipmentCatalog); }
        if (data.payments) { for (const p of data.payments) p.userId = uid; await db.payments.bulkPut(data.payments); }
        if (data.eventTodos) { for (const t of data.eventTodos) t.userId = uid; await db.eventTodos.bulkPut(data.eventTodos); }
        UI.toast('Daten importiert', 'success');
        this.navigate('#dashboard');
      } catch (err) {
        UI.toast('Fehler: ' + err.message, 'error');
      }
    };
    input.click();
  },

  // ═══════════════════════════════════════════════
  // PERSONNEL EDITOR
  // ═══════════════════════════════════════════════
  async renderPersonnel(eventId) {
    if (!eventId) {
      const events = await db.events.where('userId').equals(Auth.userId || 1).toArray();
      return `
        <div class="page-header"><h1 class="page-title">👤 Personal</h1></div>
        <p class="text-muted mb-2">Wähle einen Auftrag:</p>
        <div class="grid-2">${events.map(e => `
          <div class="card" style="cursor:pointer" onclick="app.navigate('#personnel/${e.id}')">
            <div style="font-weight:700">${e.clientName}</div>
            <div class="text-muted" style="font-size:0.875rem">${e.orderNumber} · ${UI.formatDate(e.date)}</div>
          </div>
        `).join('')}</div>`;
    }
    this.currentEventId = parseInt(eventId);
    const e = await db.events.get(this.currentEventId);
    if (!e) return '<div class="page-header"><h1>Auftrag nicht gefunden</h1></div>';
    const personnel = await db.eventPersonnel.where('eventId').equals(this.currentEventId).sortBy('sortOrder');
    const total = personnel.reduce((s, p) => s + (p.needed ? p.price * p.qty : 0), 0);

    return `
      <div class="page-header">
        <div>
          <div style="font-size:0.875rem;color:var(--c-text-3)">${e.orderNumber}</div>
          <h1 class="page-title">👤 Personal: ${e.clientName}</h1>
        </div>
        <div style="text-align:right">
          <div style="font-size:1.25rem;font-weight:700;color:var(--c-accent)">${UI.euro(total)}</div>
          <button class="btn btn-primary" onclick="app.editPersonnel()"><i data-lucide="pencil" style="width:14px;height:14px"></i> Bearbeiten</button>
        </div>
      </div>

      <div class="grid-2">
        ${personnel.map(p => `
          <div class="card" style="${!p.needed ? 'opacity:0.45' : ''}">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div style="font-weight:700;${!p.needed ? 'text-decoration:line-through' : ''}">${p.role}</div>
              ${!p.needed ? '<span class="badge" style="font-size:0.7rem;background:var(--c-text-3)">gestrichen</span>' : ''}
            </div>
            <div style="font-size:0.8125rem;color:var(--c-text-3);margin-top:4px">
              ${p.qty} ${p.unit} × ${UI.euro(p.price)} = <strong>${UI.euro(p.price * p.qty)}</strong>
            </div>
          </div>
        `).join('')}
      </div>

      ${personnel.length === 0 ? `<div class="text-muted" style="text-align:center;padding:var(--space-2xl)">
        Keine Personal-Positionen. Klicke „Bearbeiten“ um Standard-Personal hinzuzufügen.
      </div>` : ''}
    `;
  },

  async editPersonnel() {
    const personnel = await db.eventPersonnel.where('eventId').equals(this.currentEventId).sortBy('sortOrder');
    const e = await db.events.get(this.currentEventId);
    if (!e) return;

    const refresh = () => {
      const tbody = document.getElementById('personnel-edit-body');
      if (!tbody) return;
      tbody.innerHTML = personnel.map((p, i) => `
        <tr style="${!p.needed ? 'opacity:0.45' : ''}">
          <td><input type="text" value="${p.role}" style="width:100%;font-size:0.875rem;padding:4px 6px;border:1px solid var(--c-border);border-radius:var(--radius-sm);background:var(--c-bg)" onchange="app._persSetRole(${i},this.value)"></td>
          <td>
            <div class="qty-control" style="display:inline-flex;align-items:center;gap:2px;background:var(--c-bg);border:1px solid var(--c-border);border-radius:var(--radius-md);overflow:hidden">
              <button type="button" style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:none;border:none;cursor:pointer;font-size:1rem;color:var(--c-accent)" onclick="app._persInc(${i},-1)">−</button>
              <input type="number" value="${p.qty || 1}" style="width:40px;text-align:center;border:none;background:none;font-size:0.875rem" onchange="app._persSetQty(${i},this.value)">
              <button type="button" style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:none;border:none;cursor:pointer;font-size:1rem;color:var(--c-accent)" onclick="app._persInc(${i},1)">+</button>
            </div>
          </td>
          <td><input type="text" value="${p.unit}" style="width:70px;font-size:0.8125rem;padding:4px 6px;border:1px solid var(--c-border);border-radius:var(--radius-sm);background:var(--c-bg)" onchange="app._persSetUnit(${i},this.value)"></td>
          <td><input type="number" value="${p.price || 0}" step="0.01" style="width:80px;font-size:0.875rem;padding:4px 6px;border:1px solid var(--c-border);border-radius:var(--radius-sm);background:var(--c-bg)" onchange="app._persSetPrice(${i},this.value)"></td>
          <td style="text-align:center">
            <button class="btn btn-icon btn-ghost" onclick="app._persToggle(${i})" title="${p.needed ? 'Nicht benötigt' : 'Benötigt'}">${p.needed ? '✅' : '⬜'}</button>
          </td>
          <td style="white-space:nowrap">
            <button class="btn btn-icon btn-ghost" onclick="app._persMove(${i},-1)">▲</button>
            <button class="btn btn-icon btn-ghost" onclick="app._persMove(${i},1)">▼</button>
            <button class="btn btn-icon btn-ghost" style="color:var(--c-danger)" onclick="app._persRemove(${i})">✕</button>
          </td>
        </tr>
      `).join('');
    };

    app._persInc = (i, d) => { personnel[i].qty = Math.max(1, (personnel[i].qty || 1) + d); refresh(); };
    app._persSetQty = (i, v) => { personnel[i].qty = Math.max(1, parseInt(v) || 1); refresh(); };
    app._persSetRole = (i, v) => { personnel[i].role = v.trim() || 'Neue Position'; refresh(); };
    app._persSetUnit = (i, v) => { personnel[i].unit = v.trim() || 'Stk'; refresh(); };
    app._persSetPrice = (i, v) => { personnel[i].price = parseFloat(v) || 0; refresh(); };
    app._persToggle = (i) => { personnel[i].needed = !personnel[i].needed; refresh(); };
    app._persMove = (i, d) => {
      if (d === -1 && i > 0) [personnel[i-1], personnel[i]] = [personnel[i], personnel[i-1]];
      if (d === 1 && i < personnel.length-1) [personnel[i], personnel[i+1]] = [personnel[i+1], personnel[i]];
      refresh();
    };
    app._persRemove = (i) => { personnel.splice(i, 1); refresh(); };
    app._persAdd = () => {
      personnel.push({ eventId: this.currentEventId, role: 'Neue Position', qty: 1, unit: 'Pauschale', price: 0, needed: true, sortOrder: personnel.length + 1 });
      refresh();
    };

    UI.openModal('Personal bearbeiten: ' + e.clientName, `
      <div style="max-height:65vh;overflow-y:auto">
        <button class="btn btn-sm btn-primary" onclick="app._persAdd()" style="margin-bottom:var(--space-md)">+ Neue Position</button>
        <table class="data-table" style="font-size:0.8125rem;width:100%">
          <thead><tr><th>Position</th><th style="width:90px">Menge</th><th style="width:80px">Einheit</th><th style="width:90px">€/Stk</th><th style="width:70px">Aktiv</th><th style="width:120px"></th></tr></thead>
          <tbody id="personnel-edit-body"></tbody>
        </table>
      </div>
    `, async () => {
      // Delete old and add new
      if (API.token) {
        try { await API.personnel.save(this.currentEventId, personnel); } catch(e) { console.warn('API personnel save failed:', e.message); }
      }
      await db.eventPersonnel.where('eventId').equals(this.currentEventId).delete();
      if (personnel.length > 0) {
        for (let i = 0; i < personnel.length; i++) {
          personnel[i].sortOrder = i + 1;
          personnel[i].eventId = this.currentEventId;
        }
        await db.eventPersonnel.bulkAdd(personnel);
      }
      UI.toast('Personal gespeichert', 'success');
      delete app._persInc; delete app._persSetQty; delete app._persSetRole; delete app._persSetUnit;
      delete app._persSetPrice; delete app._persToggle; delete app._persMove; delete app._persRemove; delete app._persAdd;
      this.navigate(`#personnel/${this.currentEventId}`);
    }, () => {
      delete app._persInc; delete app._persSetQty; delete app._persSetRole; delete app._persSetUnit;
      delete app._persSetPrice; delete app._persToggle; delete app._persMove; delete app._persRemove; delete app._persAdd;
    });
    setTimeout(refresh, 50);
  },

  // ═══════════════════════════════════════════════
  // SETTINGS PAGE
  // ═══════════════════════════════════════════════
  async renderSettings() {
    const eventCount = await db.events.where('userId').equals(Auth.userId || 1).count();
    const userEventIds = (await db.events.where('userId').equals(Auth.userId || 1).toArray()).map(e => e.id);
    let itemCount = 0;
    for (const eid of userEventIds) { itemCount += await db.equipmentItems.where('eventId').equals(eid).count(); }
    const catalogCount = await db.equipmentCatalog.where('userId').equals(Auth.userId || 1).count();

    return `
      <div class="page-header"><h1 class="page-title">Einstellungen</h1></div>

      <div class="grid-2" style="gap:var(--space-lg)">

        <!-- Backup & Restore -->
        <div class="card">
          <div class="card-header"><div class="card-title">💾 Backup & Wiederherstellung</div></div>
          <p style="color:var(--c-text-2);font-size:0.875rem;margin-bottom:var(--space-md)">
            Exportiere alle Events, Kontakte, Equipment und Zahlungen als JSON-Datei. Dient als Redundanz falls die Datenbank beschädigt wird.
          </p>
          <div style="display:flex;gap:var(--space-sm);flex-wrap:wrap">
            <button class="btn btn-primary" onclick="app.exportData()">
              <i data-lucide="download" style="width:16px;height:16px"></i> Backup exportieren
            </button>
            <button class="btn btn-secondary" onclick="app.importData()">
              <i data-lucide="upload" style="width:16px;height:16px"></i> Wiederherstellen
            </button>
          </div>
          <div style="margin-top:var(--space-md);padding-top:var(--space-md);border-top:1px solid var(--c-border);font-size:0.8125rem;color:var(--c-text-3)">
            📊 ${eventCount} Events · ${itemCount} Equipment-Items · ${catalogCount} Katalog-Artikel
          </div>
        </div>

        <!-- Sicherheit -->
        <div class="card">
          <div class="card-header"><div class="card-title">🔒 Sicherheit</div></div>
          <p style="color:var(--c-text-2);font-size:0.875rem;margin-bottom:var(--space-md)">
            Setze ein App-Passwort für den Zugriffsschutz. Ohne Passwort ist die App für jeden mit Gerätezugriff einsehbar.
          </p>
          <button class="btn btn-secondary" onclick="app.setPassword()">
            <i data-lucide="lock" style="width:16px;height:16px"></i> Passwort ändern
          </button>
        </div>

        <!-- Admin: User erstellen -->
        ${Auth.isAdmin() ? `
        <div class="card">
          <div class="card-header"><div class="card-title">👤 Benutzerverwaltung</div></div>
          <p style="color:var(--c-text-2);font-size:0.875rem;margin-bottom:var(--space-md)">
            Erstelle neue Benutzer-Accounts. Jeder Benutzer sieht nur seine eigenen Daten.
          </p>
          <button class="btn btn-secondary" onclick="app.showCreateUser()">
            <i data-lucide="user-plus" style="width:16px;height:16px"></i> Neuen Benutzer erstellen
          </button>
        </div>` : ''}

        <!-- Katalog-Verwaltung -->
        <div class="card">
          <div class="card-header"><div class="card-title">📦 Equipment-Katalog</div></div>
          <p style="color:var(--c-text-2);font-size:0.875rem;margin-bottom:var(--space-md)">
            Verwalte den zentralen Geräte-Katalog. Artikel hier erscheinen im Katalog-Picker und in den Paketen.
          </p>
          <button class="btn btn-secondary" onclick="app.openCatalogEditor()">
            <i data-lucide="edit" style="width:16px;height:16px"></i> Katalog bearbeiten
          </button>
        </div>

        <!-- Datenbank -->
        <div class="card">
          <div class="card-header"><div class="card-title">🗑️ Datenbank</div></div>
          <p style="color:var(--c-text-2);font-size:0.875rem;margin-bottom:var(--space-md)">
            <span style="color:var(--c-danger)">Achtung:</span> Alle Daten unwiderruflich löschen. Nur nach Backup empfohlen.
          </p>
          <button class="btn btn-danger" onclick="app.resetDatabase()">
            <i data-lucide="trash-2" style="width:16px;height:16px"></i> Alle Daten löschen
          </button>
        </div>

      </div>
    `;
  },

  /* ── Katalog-Editor (inline, kein Modal) ── */
  async openCatalogEditor() {
    this.navigate('#catalog');
  },

  openCatalogEditorFromNav() {
    return this.renderCatalog();
  },

  async renderCatalog() {
    const catalog = await db.equipmentCatalog.where('userId').equals(Auth.userId || 1).toArray();
    const packages = await db.equipmentPackages.where('userId').equals(Auth.userId || 1).toArray();

    const ownCount = catalog.filter(c => !c.isExternal).length;
    const extCount = catalog.filter(c => c.isExternal).length;

    // Kategorie-Filter-Chips
    const allCats = [...new Set(catalog.map(c => c.category))].sort();

    return `
      <div class="page-header">
        <div><h1 class="page-title">📦 Katalog-Verwaltung</h1></div>
        <button class="btn btn-primary" onclick="app.addCatalogItem()"><i data-lucide="plus" style="width:14px;height:14px"></i> Neues Gerät</button>
      </div>

      <div style="display:flex;gap:var(--space-md);margin-bottom:var(--space-md);flex-wrap:wrap">
        <span class="badge badge-success">${ownCount} eigene Geräte</span>
        <span class="badge badge-warning">${extCount} externe Miete</span>
      </div>

      <!-- Kategorie-Filter -->
      <div style="display:flex;gap:6px;margin-bottom:var(--space-md);flex-wrap:wrap;align-items:center">
        <span style="font-size:0.8125rem;color:var(--c-text-3);font-weight:600">Filter:</span>
        <button class="badge" style="cursor:pointer;background:var(--c-accent);color:#fff;border:none;font-size:0.75rem" onclick="app._catFilter='';app.navigate('#catalog')">Alle</button>
        ${allCats.map(cat => `
          <button class="badge" style="cursor:pointer;background:var(--c-surface);color:var(--c-text);border:1px solid var(--c-border);font-size:0.75rem" onclick="app._catFilter='${cat}';app.navigate('#catalog')">${cat}</button>
        `).join('')}
      </div>

      <!-- Geräte-Tabelle -->
      <div class="card mb-2">
        <div style="overflow-x:auto">
          <table class="data-table" style="min-width:600px">
            <thead><tr>
              <th>Kategorie</th>
              <th>Name</th>
              <th>Einheit</th>
              <th>Lager</th>
              <th>€/Tag</th>
              <th>Tags</th>
              <th>Herkunft</th>
              <th style="width:80px"></th>
            </tr></thead>
            <tbody>
              ${catalog.filter(c => !app._catFilter || c.category === app._catFilter).map(item => `
                <tr>
                  <td><span style="color:var(--c-text-3);font-size:0.8125rem">${item.category}</span></td>
                  <td><strong>${item.name}</strong></td>
                  <td>${item.unit || '–'}</td>
                  <td><span style="font-weight:600;color:${item.stock <= 2 ? 'var(--c-warning)' : item.stock >= 10 ? 'var(--c-success)' : 'var(--c-text)'}" title="${item.stock} im Lager">${item.stock}</span></td>
                  <td>${item.priceDay ? item.priceDay.toFixed(2) + ' €' : '–'}</td>
                  <td>${(item.tags || []).slice(0,4).map(t => `<span class="badge" style="font-size:0.65rem;margin:1px">${t}</span>`).join(' ')}
                    ${(item.tags || []).length > 4 ? `<span style="font-size:0.65rem;color:var(--c-text-3)">+${item.tags.length-4}</span>` : ''}
                  </td>
                  <td>${item.isExternal
                    ? '<span class="badge badge-warning" style="font-size:0.7rem">🌐 Extern</span>'
                    : '<span class="badge badge-success" style="font-size:0.7rem">TLS Lager</span>'}
                  </td>
                  <td style="white-space:nowrap">
                    <button class="btn btn-icon btn-ghost" onclick="app.editCatalogItem(${item.id})" title="Bearbeiten"><i data-lucide="pencil" style="width:14px"></i></button>
                    <button class="btn btn-icon btn-ghost" onclick="app.deleteCatalogItem(${item.id})" title="Löschen"><i data-lucide="trash-2" style="width:14px"></i></button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Pakete -->
      <div style="display:flex;justify-content:space-between;align-items:center;margin:var(--space-xl) 0 var(--space-sm)">
        <h2 style="font-size:1rem;margin:0;display:flex;align-items:center;gap:8px">
          📦 Pakete <span class="badge badge-success" style="font-size:0.7rem">${packages.length}</span>
        </h2>
        <button class="btn btn-sm btn-primary" onclick="app.addPackageTemplate()"><i data-lucide="plus" style="width:12px;height:12px"></i> Neues Paket</button>
      </div>
      <div class="grid-2">
        ${packages.map(pkg => `
          <div class="card" style="cursor:pointer" onclick="app.editPackage(${pkg.id})" title="Paket bearbeiten">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:var(--space-sm)">
              <div>
                <div style="font-weight:700">${pkg.name}</div>
                <div style="font-size:0.8125rem;color:var(--c-text-3);margin-top:2px">${pkg.description || ''}</div>
                <div style="font-size:0.75rem;color:var(--c-text-3);margin-top:4px">${(pkg.items || []).length} Geräte · ${[...new Set((pkg.items || []).map(i => i.group))].join(', ') || 'Keine Gruppen'}</div>
              </div>
              <div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end;max-width:45%">
                ${(pkg.tags || []).map(t => `<span class="badge" style="font-size:0.65rem">${t}</span>`).join(' ')}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  },
  _catFilter: '',
  _pickerCatFilter: '',

  async addCatalogItem() {
    const fields = [
      { name: 'category', label: 'Kategorie', placeholder: 'z.B. Mischpult, Lautsprecher' },
      { name: 'name', label: 'Name', placeholder: 'z.B. Allen & Heath SQ6' },
      { name: 'unit', label: 'Einheit', placeholder: 'Stk, Set, Paar, Rolle' },
      { name: 'stock', label: 'Lager-Bestand', type: 'number', placeholder: '1' },
      { name: 'priceDay', label: 'Preis pro Tag (€)', type: 'number', placeholder: '0' },
      { name: 'tags', label: 'Tags (kommasepariert)', placeholder: 'PA, Mischpult, Band' },
      { name: 'isExternal', label: 'Externe Miete?', type: 'checkbox' }
    ];
    UI.openModal('Gerät zum Katalog hinzufügen', `<form id="cat-form">${UI.form(fields)}</form>`, async () => {
      const d = UI.getFormData(document.getElementById('cat-form'));
      d.priceDay = parseFloat(d.priceDay) || 0;
      d.stock = parseInt(d.stock) || 1;
      d.tags = (d.tags || '').split(',').map(t => t.trim()).filter(Boolean);
      d.isExternal = !!d.isExternal;
      d.userId = Auth.userId || 1;
      await db.equipmentCatalog.add(d);
      UI.toast('Gerät hinzugefügt', 'success');
      this.openCatalogEditor();
    });
  },

  async editCatalogItem(id) {
    const item = await db.equipmentCatalog.get(id);
    const fields = [
      { name: 'category', label: 'Kategorie', value: item.category },
      { name: 'name', label: 'Name', value: item.name },
      { name: 'unit', label: 'Einheit', value: item.unit },
      { name: 'stock', label: 'Lager-Bestand', type: 'number', value: item.stock },
      { name: 'priceDay', label: 'Preis pro Tag (€)', type: 'number', value: item.priceDay },
      { name: 'tags', label: 'Tags (kommasepariert)', value: (item.tags || []).join(', ') },
      { name: 'isExternal', label: 'Externe Miete?', type: 'checkbox', value: item.isExternal }
    ];
    UI.openModal('Gerät bearbeiten', `<form id="cat-edit-form">${UI.form(fields)}</form>`, async () => {
      const d = UI.getFormData(document.getElementById('cat-edit-form'));
      d.priceDay = parseFloat(d.priceDay) || 0;
      d.stock = parseInt(d.stock) || 1;
      d.tags = (d.tags || '').split(',').map(t => t.trim()).filter(Boolean);
      d.isExternal = !!d.isExternal;
      d.userId = Auth.userId || 1;
      await db.equipmentCatalog.update(id, d);
      UI.toast('Gerät aktualisiert', 'success');
      this.openCatalogEditor();
    });
  },

  async addPackageTemplate() {
    const fields = [
      { name: 'name', label: 'Paket-Name', placeholder: 'z.B. Band-Komplett' },
      { name: 'description', label: 'Beschreibung', placeholder: 'Kurzbeschreibung' }
    ];
    UI.openModal('Neues Paket erstellen', `<form id="pkg-form">${UI.form(fields)}</form>`, async () => {
      const d = UI.getFormData(document.getElementById('pkg-form'));
      d.tags = [];
      d.items = [];
      d.userId = Auth.userId || 1;
      await db.equipmentPackages.add(d);
      UI.toast('Paket erstellt', 'success');
      this.openCatalogEditor();
    });
  },

  /* ── Paket-Editor (Inline) ── */
  async editPackage(pkgId) {
    const pkg = await db.equipmentPackages.get(pkgId);
    if (!pkg) return;
    const catalog = await db.equipmentCatalog.where('userId').equals(Auth.userId || 1).toArray();
    const catalogMap = new Map(catalog.map(c => [c.name, c]));

    // Ensure items array exists
    let items = pkg.items || [];
    // Fallback for legacy tag-based packages: build items from tags
    if (items.length === 0 && (pkg.tags || []).length > 0) {
      const pkgTags = new Set(pkg.tags);
      let sortOrder = 1;
      for (const cat of catalog) {
        if (cat.tags && cat.tags.some(t => pkgTags.has(t))) {
          items.push({ name: cat.name, qty: 1, group: cat.category || 'Standard', sortOrder: sortOrder++ });
        }
      }
    }

    const refresh = () => {
      const tbody = document.getElementById('pkg-edit-items');
      if (!tbody) return;
      // Group by group name, then sort by sortOrder
      const grouped = {};
      items.forEach(it => {
        const g = it.group || 'Standard';
        if (!grouped[g]) grouped[g] = [];
        grouped[g].push(it);
      });
      Object.values(grouped).forEach(arr => arr.sort((a,b) => (a.sortOrder||0) - (b.sortOrder||0)));

      tbody.innerHTML = Object.entries(grouped).map(([groupName, arr]) => `
        <tr style="background:var(--c-surface-light)">
          <td colspan="6" style="font-weight:700;font-size:0.875rem;padding:6px 12px">${groupName}</td>
        </tr>
        ${arr.map((it, idxInGroup) => `
          <tr>
            <td>${it.name}</td>
            <td>
              <div class="qty-control" style="display:inline-flex;align-items:center;gap:2px;background:var(--c-bg);border:1px solid var(--c-border);border-radius:var(--radius-md);overflow:hidden">
                <button type="button" style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:none;border:none;cursor:pointer;font-size:1rem;color:var(--c-accent)" onclick="app._pkgInc(${items.indexOf(it)},-1)">−</button>
                <input type="number" value="${it.qty || 1}" style="width:40px;text-align:center;border:none;background:none;font-size:0.875rem" onchange="app._pkgSetQty(${items.indexOf(it)},this.value)">
                <button type="button" style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:none;border:none;cursor:pointer;font-size:1rem;color:var(--c-accent)" onclick="app._pkgInc(${items.indexOf(it)},1)">+</button>
              </div>
            </td>
            <td><input type="text" value="${it.group || 'Standard'}" style="width:120px;font-size:0.8125rem;padding:4px 6px;border:1px solid var(--c-border);border-radius:var(--radius-sm);background:var(--c-bg)" onchange="app._pkgSetGroup(${items.indexOf(it)},this.value)"></td>
            <td style="white-space:nowrap">
              <button class="btn btn-icon btn-ghost" onclick="app._pkgMove(${items.indexOf(it)},-1)" title="Nach oben">▲</button>
              <button class="btn btn-icon btn-ghost" onclick="app._pkgMove(${items.indexOf(it)},1)" title="Nach unten">▼</button>
            </td>
            <td>
              <button class="btn btn-icon btn-ghost" style="color:var(--c-danger)" onclick="app._pkgRemove(${items.indexOf(it)})" title="Entfernen">✕</button>
            </td>
          </tr>
        `).join('')}
      `).join('');
    };

    // Bind helpers onto app so inline onclick works
    app._pkgInc = (i, delta) => { items[i].qty = Math.max(1, (items[i].qty || 1) + delta); refresh(); };
    app._pkgSetQty = (i, v) => { items[i].qty = Math.max(1, parseInt(v) || 1); refresh(); };
    app._pkgSetGroup = (i, v) => { items[i].group = v.trim() || 'Standard'; refresh(); };
    app._pkgMove = (i, dir) => {
      if (dir === -1 && i > 0) [items[i-1], items[i]] = [items[i], items[i-1]];
      if (dir === 1 && i < items.length-1) [items[i], items[i+1]] = [items[i+1], items[i]];
      refresh();
    };
    app._pkgRemove = (i) => { items.splice(i, 1); refresh(); };
    app._pkgAddItem = (itemName) => {
      const cat = catalogMap.get(itemName);
      items.push({ name: itemName, qty: 1, group: cat ? cat.category : 'Standard', sortOrder: items.length + 1 });
      refresh();
    };

    const unusedCatalog = catalog.filter(c => !items.some(it => it.name === c.name));

    UI.openModal('Paket bearbeiten: ' + pkg.name, `
      <div style="max-height:70vh;overflow-y:auto;padding-right:4px">
        <div style="display:flex;gap:var(--space-sm);margin-bottom:var(--space-md);flex-wrap:wrap">
          <input id="pkg-edit-name" value="${pkg.name}" placeholder="Paketname" style="flex:1;min-width:150px;font-size:0.9375rem;padding:6px 10px;border:1px solid var(--c-border);border-radius:var(--radius-md);background:var(--c-bg)">
          <input id="pkg-edit-desc" value="${pkg.description || ''}" placeholder="Beschreibung" style="flex:2;min-width:200px;font-size:0.9375rem;padding:6px 10px;border:1px solid var(--c-border);border-radius:var(--radius-md);background:var(--c-bg)">
        </div>

        <!-- Hinzufügen -->
        <div style="display:flex;gap:var(--space-sm);margin-bottom:var(--space-md);align-items:center">
          <select id="pkg-add-select" style="flex:1;padding:6px 10px;border:1px solid var(--c-border);border-radius:var(--radius-md);background:var(--c-bg);font-size:0.875rem">
            <option value="" disabled selected>Gerät hinzufügen...</option>
            ${unusedCatalog.map(c => `<option value="${c.name}">${c.category} — ${c.name}</option>`).join('')}
          </select>
          <button class="btn btn-sm btn-primary" onclick="const s=document.getElementById('pkg-add-select');if(s.value){app._pkgAddItem(s.value);s.value='';}">Hinzufügen</button>
        </div>

        <!-- Items-Tabelle -->
        <table class="data-table" style="width:100%;margin-bottom:var(--space-md)">
          <thead>
            <tr><th>Gerät</th><th style="width:90px">Menge</th><th>Gruppe</th><th style="width:80px">Reihe</th><th style="width:50px"></th></tr>
          </thead>
          <tbody id="pkg-edit-items"></tbody>
        </table>

        ${items.length === 0 ? '<p style="color:var(--c-text-3);text-align:center">Noch keine Geräte im Paket.</p>' : ''}
      </div>
    `, async () => {
      const name = document.getElementById('pkg-edit-name').value.trim();
      const desc = document.getElementById('pkg-edit-desc').value.trim();
      if (!name) { UI.toast('Name erforderlich', 'error'); return false; }
      await db.equipmentPackages.update(pkgId, {
        name, description: desc, items,
        tags: [...new Set(items.map(i => i.group).filter(Boolean))]
      });
      UI.toast('Paket gespeichert', 'success');
      delete app._pkgInc; delete app._pkgSetQty; delete app._pkgSetGroup;
      delete app._pkgMove; delete app._pkgRemove; delete app._pkgAddItem;
      this.openCatalogEditor();
    }, () => {
      delete app._pkgInc; delete app._pkgSetQty; delete app._pkgSetGroup;
      delete app._pkgMove; delete app._pkgRemove; delete app._pkgAddItem;
    });

    // Render initial list
    setTimeout(refresh, 50);
  },

  async deleteCatalogItem(id) {
    const item = await db.equipmentCatalog.get(id);
    if (!item) return;
    UI.confirm(`Gerät "${item.name}" aus dem Katalog löschen?\n\nDas entfernt es nicht aus bestehenden Events, nur aus dem Katalog.`, async () => {
      await db.equipmentCatalog.delete(id);
      UI.toast('Gerät aus Katalog entfernt', 'info');
      this.navigate('#catalog');
    });
  },

  // ═══════════════════════════════════════════════
  // KATALOG-PICKER (mit Mengenauswahl)
  // ═══════════════════════════════════════════════
  async openCatalogPicker() {
    const catalog = await db.equipmentCatalog.where('userId').equals(Auth.userId || 1).toArray();
    const existing = await db.equipmentItems.where('eventId').equals(this.currentEventId).toArray();
    const existingMap = new Map(existing.map(e => [e.name, e]));

    // Gruppiere nach Kategorie
    const byCat = {};
    catalog.forEach(item => {
      if (!byCat[item.category]) byCat[item.category] = [];
      byCat[item.category].push(item);
    });

    // Kategorie-Filter-Chips
    const allCats = Object.keys(byCat).sort();
    const filter = app._pickerCatFilter || '';
    const catsToShow = filter ? [filter] : allCats;

    const html = `
      <div style="max-height:65vh;overflow-y:auto;padding-right:4px">
        <!-- Kategorie-Filter -->
        <div style="display:flex;gap:6px;margin-bottom:var(--space-md);flex-wrap:wrap;align-items:center;position:sticky;top:0;background:var(--c-bg);z-index:1;padding-bottom:4px">
          <span style="font-size:0.8125rem;color:var(--c-text-3);font-weight:600">Filter:</span>
          <button class="badge" style="cursor:pointer;background:${!filter?'var(--c-accent);color:#fff':'var(--c-surface);color:var(--c-text);border:1px solid var(--c-border)'};border:none;font-size:0.75rem" onclick="app._pickerCatFilter='';app.openCatalogPicker()">Alle</button>
          ${allCats.map(cat => `
            <button class="badge" style="cursor:pointer;background:${filter===cat?'var(--c-accent);color:#fff':'var(--c-surface);color:var(--c-text);border:1px solid var(--c-border)'};border:none;font-size:0.75rem" onclick="app._pickerCatFilter='${cat}';app.openCatalogPicker()">${cat}</button>
          `).join('')}
        </div>
        <style>
          .cat-picker-item {
            display: flex; align-items: center; gap: var(--space-sm);
            padding: 10px 8px;
            border-radius: var(--radius-md);
            margin-bottom: 4px;
            transition: background 150ms;
          }
          .cat-picker-item:hover { background: var(--c-bg-elev); }
          .cat-picker-item.added { opacity: 0.45; background: var(--c-bg); }
          .qty-control {
            display: flex; align-items: center; gap: 2px;
            background: var(--c-bg);
            border: 1px solid var(--c-border);
            border-radius: var(--radius-md);
            overflow: hidden;
          }
          .qty-control button {
            width: 32px; height: 32px;
            display: flex; align-items: center; justify-content: center;
            background: none; border: none; cursor: pointer;
            font-size: 1.1rem; font-weight: 700;
            color: var(--c-accent);
            transition: background 150ms;
          }
          .qty-control button:hover { background: var(--c-bg-elev); }
          .qty-control button:active { background: var(--c-border); }
          .qty-control .qty-value {
            width: 36px; text-align: center;
            font-weight: 600; font-size: 0.9375rem;
            border: none; background: none;
            color: var(--c-text);
            -moz-appearance: textfield;
          }
          .qty-control .qty-value::-webkit-outer-spin-button,
          .qty-control .qty-value::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
          .add-big-btn {
            width: 48px; height: 40px;
            display: flex; align-items: center; justify-content: center;
            border-radius: var(--radius-md);
            border: 2px dashed var(--c-accent);
            background: var(--c-bg);
            color: var(--c-accent);
            cursor: pointer;
            transition: all 150ms;
            flex-shrink: 0;
          }
          .add-big-btn:hover {
            background: var(--c-accent);
            color: white;
            border-style: solid;
          }
          .add-big-btn:active { transform: scale(0.95); }
          .add-big-btn.added {
            border-color: var(--c-success);
            background: var(--c-success);
            color: white;
            border-style: solid;
          }
          .add-big-btn .lucide { width: 22px; height: 22px; }
        </style>

        ${catsToShow.map(cat => `
          <div style="margin-bottom:var(--space-md)">
            <h4 style="font-size:0.8125rem;color:var(--c-text-3);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.06em;font-weight:600">${cat}</h4>
            ${byCat[cat].map(item => {
              const already = existingMap.get(item.name);
              const isAdded = !!already;
              const extBadge = item.isExternal ? `<span class="badge badge-warning" style="font-size:0.65rem;margin-left:6px">🌐 Miete</span>` : '';
              const tagStr = item.tags ? item.tags.slice(0, 3).map(t => `<span style="background:var(--c-bg);padding:2px 6px;border-radius:4px;font-size:0.7rem;margin-left:4px;color:var(--c-text-3)">${t}</span>`).join('') : '';
              return `
                <div class="cat-picker-item ${isAdded ? 'added' : ''}">
                  <!-- Mengensteuerung -->
                  <div class="qty-control">
                    <button onclick="app.adjustQty(${item.id}, -1)">−</button>
                    <input type="number" class="qty-value" id="qty-${item.id}" value="1" min="1"
                      onchange="app.clampQty(${item.id})" onkeydown="if(event.key==='Enter')app.addFromCatalog(${item.id})">
                    <button onclick="app.adjustQty(${item.id}, 1)">+</button>
                  </div>

                  <!-- Info -->
                  <div style="flex:1;min-width:0">
                    <div style="font-weight:600;font-size:0.9375rem;display:flex;align-items:center">
                      ${item.name}${extBadge}
                    </div>
                    <div style="font-size:0.75rem;color:var(--c-text-3);display:flex;align-items:center;flex-wrap:wrap;gap:3px;margin-top:1px">
                      ${item.unit} · ${item.priceDay > 0 ? item.priceDay.toFixed(2) + ' €/Tag' : 'inkl.'}${tagStr}
                    </div>
                  </div>

                  <!-- Große Add-Taste -->
                  <button class="add-big-btn ${isAdded ? 'added' : ''}" id="btn-add-${item.id}"
                    onclick="app.addFromCatalog(${item.id})"
                    title="${isAdded ? 'Bereits in Packliste' : 'Zur Packliste hinzufügen'}">
                    <i data-lucide="${isAdded ? 'check' : 'plus'}" style="width:22px;height:22px"></i>
                  </button>
                  <!-- Löschen aus Katalog -->
                  <button class="btn btn-icon btn-ghost" onclick="event.stopPropagation();app.deleteCatalogPickerItem(${item.id})"
                    title="Aus Katalog löschen" style="width:32px;height:40px;flex-shrink:0">
                    <i data-lucide="trash-2" style="width:14px;height:14px;color:var(--c-danger)"></i>
                  </button>
                </div>
              `;
            }).join('')}
          </div>
        `).join('')}
      </div>
    `;
    UI.openModal('📦 Katalog', html, null, true);
    lucide.createIcons();
  },

  adjustQty(id, delta) {
    const input = document.getElementById(`qty-${id}`);
    if (!input) return;
    let v = parseInt(input.value) || 1;
    v = Math.max(1, v + delta);
    input.value = v;
  },

  clampQty(id) {
    const input = document.getElementById(`qty-${id}`);
    if (!input) return;
    let v = parseInt(input.value) || 1;
    if (v < 1) v = 1;
    input.value = v;
  },

  async addFromCatalog(catalogId) {
    const item = await db.equipmentCatalog.get(catalogId);
    const qtyInput = document.getElementById(`qty-${catalogId}`);
    const qty = qtyInput ? (parseInt(qtyInput.value) || 1) : 1;

    const existing = await db.equipmentItems.where({ eventId: this.currentEventId, name: item.name }).first();
    if (existing) {
      // Update quantity instead of error
      await db.equipmentItems.update(existing.id, { qty: existing.qty + qty });
      UI.toast(`${item.name}: +${qty} (jetzt ${existing.qty + qty})`, 'success');
      this.openCatalogPicker();
      return;
    }

    // Bestands-Konflikt-Prüfung via zentrale Funktion
    if (!item.isExternal && item.stock < 999) {
      const conflict = await this.checkStockConflict(item, qty, this.currentEventId);
      if (conflict.conflict) {
        UI.toast(`⚠️ Nicht genug auf Lager! ${conflict.available}/${conflict.stock} verfügbar, ${conflict.used} in anderen Events gebucht.`, 'error', 5000);
        return;
      }
    }

    await db.equipmentItems.add({
      eventId: this.currentEventId,
      category: item.category,
      name: item.name,
      qty: qty,
      needed: true,
      packed: false,
      note: '',
      source: 'catalog',
      isExternal: !!item.isExternal,
      priceDay: item.priceDay || 0
    });
    UI.toast(`${item.name} × ${qty} hinzugefügt`, 'success');
    this.openCatalogPicker();
  },

  async deleteCatalogPickerItem(catalogId) {
    const item = await db.equipmentCatalog.get(catalogId);
    if (!item) return;
    UI.confirm(`Gerät "${item.name}" aus dem Katalog löschen?\\n\\nDas entfernt es nicht aus bestehenden Events, nur aus dem Katalog.`, async () => {
      await db.equipmentCatalog.delete(catalogId);
      UI.toast('Gerät aus Katalog entfernt', 'info');
      this.openCatalogPicker();
    });
  },

  async resetDatabase() {
    UI.confirm('<strong>ALLE Daten löschen?</strong><br>Dies kann nicht rückgängig gemacht werden. Bitte vorher ein Backup exportieren!', async () => {
      await db.delete();
      location.reload();
    });
  },

  async changeEventStatus(id, status) {
    const statusLabel = { inquiry:'Anfrage', offer:'Angebot', inspected:'Besichtigt', confirmed:'Bestätigt', paid:'Bezahlt', done:'Abgeschlossen', cancelled:'Storniert' };
    const data = { status, statusLabel: statusLabel[status] };
    if (API.token) {
      try { await API.events.update(id, data); } catch(e) { console.warn('API status update failed:', e.message); }
    }
    await db.events.update(id, data);
    UI.toast(`Status: ${statusLabel[status]}`, 'success');
    this.navigate(`#planner/${id}`);
  },

  // ═══════════════════════════════════════════════
  // EVENT TODOS
  // ═══════════════════════════════════════════════
  async renderEventTodos(eventId) {
    const todos = await db.eventTodos.where('eventId').equals(eventId).sortBy('dueDate');
    const items = todos.map(t => {
      const overdue = t.dueDate && t.dueDate < new Date().toISOString().slice(0,10) && !t.done;
      return `
        <div class="todo-item ${t.done ? 'done' : ''} ${overdue ? 'overdue' : ''}" style="display:flex;align-items:center;gap:var(--space-sm);padding:var(--space-sm);border-radius:var(--radius-md);background:var(--c-bg-2);margin-bottom:6px">
          <input type="checkbox" ${t.done ? 'checked' : ''} onchange="app.toggleEventTodo(${t.id})" style="width:18px;height:18px;cursor:pointer;flex-shrink:0">
          <div style="flex:1;min-width:0">
            <div style="font-weight:500;${t.done ? 'text-decoration:line-through;color:var(--c-text-3)' : ''}">${t.title}</div>
            ${t.dueDate ? `<div style="font-size:0.75rem;color:${overdue ? 'var(--c-danger)' : 'var(--c-text-3)'}" class="todo-due">${overdue ? '⚠️ ' : '📅 '}${UI.formatDate(t.dueDate)}</div>` : ''}
          </div>
          <button class="btn btn-ghost btn-sm" onclick="app.deleteEventTodo(${t.id})"><i data-lucide="trash-2" style="width:14px;height:14px"></i></button>
        </div>`;
    }).join('');

    return `
      <div class="card mb-3 ${todos.length === 0 ? 'print-hide' : ''}">
        <div class="card-header">
          <div class="card-title"><i data-lucide="check-square"></i>TODOs</div>
          <button class="btn btn-sm btn-primary" onclick="app.addEventTodo()"><i data-lucide="plus" style="width:14px;height:14px"></i>Neu</button>
        </div>
        <div class="todo-list">${items || UI.emptyState('check-square', 'Keine TODOs', 'Füge deine erste Aufgabe hinzu.')}</div>
      </div>`;
  },

  async addEventTodo() {
    UI.openModal('Neues TODO', `<form id="todo-form">${UI.form([
      { name: 'title', label: 'Aufgabe', required: true },
      { name: 'dueDate', label: 'Fällig bis', type: 'date' }
    ])}</form>`, async () => {
      const data = UI.getFormData(document.getElementById('todo-form'));
      await db.eventTodos.add({
        eventId: this.currentEventId,
        title: data.title,
        dueDate: data.dueDate || '',
        done: false
      });
      UI.toast('TODO hinzugefügt', 'success');
      this.navigate(`#planner/${this.currentEventId}`);
    });
  },

  async toggleEventTodo(id) {
    const scrollY = window.scrollY;
    const t = await db.eventTodos.get(id);
    if (!t) return;
    await db.eventTodos.update(id, { done: !t.done });
    this.navigate(`#planner/${this.currentEventId}`);
    requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: 'instant' }));
  },

  async deleteEventTodo(id) {
    const scrollY = window.scrollY;
    UI.confirm('TODO löschen?', async () => {
      await db.eventTodos.delete(id);
      UI.toast('TODO gelöscht', 'info');
      this.navigate(`#planner/${this.currentEventId}`);
      requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: 'instant' }));
    });
  },

  // ═══════════════════════════════════════════════
  // ANGEBOTS-PDF (§19 UStG)
  // ═══════════════════════════════════════════════
  async generateOfferPDF(eventId) {
    const e = await db.events.get(eventId);
    if (!e) return;
    const items = await db.equipmentItems.where('eventId').equals(eventId).toArray();
    const total = items.reduce((s, i) => s + (i.qty || 1) * (i.priceDay || 0), 0);

    const printHtml = `
      <div style="max-width:700px;margin:0 auto;padding:40px;font-family:system-ui,sans-serif;color:#111;background:#fff">
        <div style="text-align:center;margin-bottom:24px">
          <h1 style="margin:0 0 4px 0;font-size:1.6rem">Timon Live Sound</h1>
          <p style="margin:0;color:#555">Event-Technik &amp; Veranstaltungsservice</p>
        </div>
        <h2 style="font-size:1.2rem;border-bottom:1px solid #ddd;padding-bottom:8px;margin:20px 0 12px 0">Angebot ${e.orderNumber || ''}</h2>
        <p><strong>Kunde:</strong> ${e.clientName || ''}<br>
        <strong>Veranstaltung:</strong> ${e.eventType || ''}<br>
        <strong>Datum:</strong> ${e.date ? UI.formatDate(e.date) : '-'}<br>
        <strong>Location:</strong> ${e.locations || '-'}</p>

        <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:0.9rem">
          <thead><tr style="border-bottom:1px solid #ccc">
            <th style="text-align:left;padding:6px 0">Pos</th>
            <th style="text-align:left;padding:6px 0">Bezeichnung</th>
            <th style="text-align:center;padding:6px 0">Menge</th>
            <th style="text-align:right;padding:6px 0">Tagessatz</th>
            <th style="text-align:right;padding:6px 0">Gesamt</th>
          </tr></thead>
          <tbody>
            ${items.map((it, idx) => `
              <tr style="border-bottom:1px solid #eee">
                <td style="padding:5px 0">${idx + 1}</td>
                <td style="padding:5px 0">${it.name}</td>
                <td style="text-align:center;padding:5px 0">${it.qty || 1}</td>
                <td style="text-align:right;padding:5px 0">${(it.priceDay || 0).toFixed(2).replace('.', ',')} €</td>
                <td style="text-align:right;padding:5px 0">${((it.qty || 1) * (it.priceDay || 0)).toFixed(2).replace('.', ',')} €</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div style="text-align:right;font-size:1.05rem;font-weight:700;margin-top:16px">
          Summe: ${total.toFixed(2).replace('.', ',')} €
        </div>
        <div style="margin-top:6px;font-size:0.85rem;color:#555">
          <em>Gemäß §19 Abs. 1 UStG wird keine Umsatzsteuer ausgewiesen (Kleinunternehmer).</em>
        </div>

        <div style="margin-top:32px;font-size:0.8rem;color:#555">
          <p>Dieses Angebot ist 14 Tage gültig.<br>
          TLS — Timon Live Sound | timon@tls-livesound.de | +49 176 12345678</p>
        </div>
      </div>`;

    const original = document.getElementById('page-content').innerHTML;
    document.getElementById('page-content').innerHTML = `<div class="print-only-content">${printHtml}</div>`;
    window.print();
    document.getElementById('page-content').innerHTML = original;
    lucide.createIcons();
    this.navigate(`#planner/${eventId}`);
  },

  // ═══════════════════════════════════════════════
  // E-MAIL VERSAND
  // ═══════════════════════════════════════════════
  async sendEventEmail(eventId) {
    const e = await db.events.get(eventId);
    if (!e) return;
    const items = await db.equipmentItems.where('eventId').equals(eventId).toArray();
    const total = items.reduce((s, i) => s + (i.qty || 1) * (i.priceDay || 0), 0);

    const equipmentList = items.map(it => `• ${it.name} × ${it.qty || 1}`).join('\n');
    const subject = `Angebot ${e.orderNumber || ''} — ${e.eventType || ''} am ${e.date || ''}`;
    const body = `Hallo ${e.clientName || ''},\n\n` +
      `vielen Dank für deine Anfrage! Gerne unterbreite ich dir folgendes Angebot:\n\n` +
      `📅 Veranstaltung: ${e.eventType || ''}\n` +
      `📍 Location: ${e.locations || '-'}\n` +
      `💰 Gesamtskosten: ${total.toFixed(2).replace('.', ',')} € (netto, §19 UStG)\n\n` +
      `Equipment:\n${equipmentList || '(noch kein Equipment ausgewählt)'}\n\n` +
      `Bei Fragen erreichst du mich jederzeit unter +49 176 12345678 oder per Antwort auf diese E-Mail.\n\n` +
      `Freundliche Grüße\nTimon | TLS Live Sound`;

    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  },

  // ═══════════════════════════════════════════════
  // VERFÜGBARKEITSKALENDER
  // ═══════════════════════════════════════════════
  async showAvailabilityCalendar(year = new Date().getFullYear(), month = new Date().getMonth()) {
    // Normale Werte — JavaScript new Date(year, 13) → nächstes Jahr funktioniert
    const startOfMonth = new Date(year, month, 1);
    const displayYear = startOfMonth.getFullYear();
    const displayMonth = startOfMonth.getMonth();
    const endOfMonth = new Date(displayYear, displayMonth + 1, 0);
    const daysInMonth = endOfMonth.getDate();
    const firstDay = startOfMonth.getDay(); // 0=Su, 1=Mo...

    // Alle Events laden
    const allEvents = await db.events.where('userId').equals(Auth.userId || 1).toArray();

    // Hilfsfunktion: ISO-String YYYY-MM-DD erstellen OHNE UTC-Shift
    const toLocalISO = (y, m, d) => {
      const s = String(y);
      const sm = String(m + 1).padStart(2, '0');
      const sd = String(d).padStart(2, '0');
      return `${s}-${sm}-${sd}`;
    };

    const eventsInMonth = allEvents.filter(ev => {
      if (!ev.date) return false;
      const [ey, em, ed] = ev.date.split('-').map(Number);
      return ey === displayYear && em === displayMonth + 1;
    });

    const calendarDays = [];
    // Leere Tage im Vormonat (Montags-start)
    const padding = firstDay === 0 ? 6 : firstDay - 1;
    for (let i = 0; i < padding; i++) calendarDays.push(`<div class="cal-day empty"></div>`);

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = toLocalISO(displayYear, displayMonth, d);
      const dayEvents = eventsInMonth.filter(ev => ev.date === dateStr);
      const eventDots = dayEvents.map(ev => {
        const color = { inquiry:'#3b82f6', offer:'#eab308', inspected:'#a855f7', confirmed:'#22c55e', paid:'#0ea5e9', done:'#64748b', cancelled:'#ef4444' }[ev.status] || '#9ca3af';
        return `<span class="cal-dot" style="background:${color}" title="${ev.clientName} (${ev.status})"></span>`;
      }).join('');
      const isToday = new Date().toISOString().slice(0,10) === dateStr;
      const hasMultiple = dayEvents.length > 1;
      if (dayEvents.length > 0) {
        calendarDays.push(`
          <div class="cal-day ${isToday ? 'today' : ''} ${hasMultiple ? 'multiple' : ''}" onclick="app.showDayEvents(${displayYear},${displayMonth},${d})">
            <span style="font-size:0.75rem;font-weight:600;color:var(--c-text-2)">${d}</span>
            <div style="display:flex;gap:2px;flex-wrap:wrap;margin-top:3px;justify-content:center">${eventDots}</div>
          </div>`);
      } else {
        // Leerer Tag → Klick = neuer Auftrag mit diesem Datum
        calendarDays.push(`
          <div class="cal-day ${isToday ? 'today' : ''}" onclick="app.createEventFromCalendar('${dateStr}')">
            <span style="font-size:0.75rem;font-weight:600;color:var(--c-text-2)">${d}</span>
          </div>`);
      }
    }

    const monthNames = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

    const html = `
      <div class="page-header" style="flex-wrap:wrap;gap:var(--space-sm)">
        <div><h1 class="page-title">Verfügbarkeitskalender</h1><p class="page-subtitle">Auftragsübersicht · Rot = Doppelbuchung</p></div>
        <div style="display:flex;align-items:center;gap:0;margin-left:auto">
          <button class="btn btn-ghost" style="min-width:40px" onclick="app.navigate('#calendar/${displayYear}/${displayMonth - 1}')" title="Vorheriger Monat">◀</button>
          <span style="font-weight:600;width:140px;text-align:center;white-space:nowrap">${monthNames[displayMonth]} ${displayYear}</span>
          <button class="btn btn-ghost" style="min-width:40px" onclick="app.navigate('#calendar/${displayYear}/${displayMonth + 1}')" title="Nächster Monat">▶</button>
          <button class="btn btn-secondary btn-sm" style="margin-left:var(--space-sm)" onclick="app.navigate('#dashboard')">Zurück</button>
        </div>
      </div>
      <div class="card">
        <div class="cal-grid">
          <div class="cal-header">Mo</div>
          <div class="cal-header">Di</div>
          <div class="cal-header">Mi</div>
          <div class="cal-header">Do</div>
          <div class="cal-header">Fr</div>
          <div class="cal-header">Sa</div>
          <div class="cal-header">So</div>
          ${calendarDays.join('')}
        </div>
        <div style="display:flex;gap:var(--space-md);margin-top:var(--space-md);flex-wrap:wrap;font-size:0.8rem;color:var(--c-text-3)">
          <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#3b82f6;margin-right:4px"></span>Anfrage</span>
          <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#eab308;margin-right:4px"></span>Angebot</span>
          <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#22c55e;margin-right:4px"></span>Bestätigt</span>
          <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#ef4444;margin-right:4px"></span>Storniert</span>
          <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#e94560;margin-right:4px"></span>2+ Events</span>
        </div>
      </div>`;

    return html;
  },

  // Klick auf leeren Kalendertag → sofort neuer Auftrag mit Datum
  async createEventFromCalendar(dateStr) {
    const fields = [
      { name: 'clientName', label: 'Kunde / Event', required: true },
      { name: 'eventType', label: 'Art', type: 'select', options: [
        { value: 'Hochzeit', label: 'Hochzeit' },
        { value: 'Firmenfeier', label: 'Firmenfeier' },
        { value: 'Konzert', label: 'Konzert' },
        { value: 'Geburtstag', label: 'Geburtstag' },
        { value: 'Kirche', label: 'Kirche' },
        { value: 'Club', label: 'Club / Disco' },
        { value: 'Outdoor', label: 'Open-Air / Outdoor' },
        { value: 'Sonstiges', label: 'Sonstiges' }
      ]},
      { name: 'date', label: 'Datum', type: 'date', value: dateStr },
      { name: 'startTime', label: 'Beginn', placeholder: 'z.B. 19:00' },
      { name: 'personCount', label: 'Personenanzahl', type: 'number', placeholder: '0' },
      { name: 'totalPrice', label: 'Preis (€)', type: 'number', placeholder: '0.00', step: '0.01' }
    ];
    UI.openModal('Neuer Auftrag am ' + UI.formatDate(dateStr), `<form id="quick-event-form">${UI.form(fields)}</form>`, async () => {
      const data = UI.getFormData(document.getElementById('quick-event-form'));
      // Generate order number
      const count = await db.events.where('userId').equals(Auth.userId || 1).count();
      const now = new Date();
      data.orderNumber = 'TLS-' + now.getFullYear() + String(now.getMonth() + 1).padStart(2,'0') + '-' + String(count + 1).padStart(3,'0');
      data.status = 'inquiry';
      data.statusLabel = 'Anfrage';
      data.date = dateStr;
      data.userId = Auth.userId || 1;
      data.orderType = 'event';
      data.remaining = (data.totalPrice || 0) - (data.deposit || 0);
      data.deposit = data.deposit || 0;
      data.duration = 1;
      data.km = 0;
      data.deposit = data.deposit || 0;
      data.remaining = data.totalPrice - data.deposit;
      data.synced = API.token ? 0 : 1;
      let id;
      if (API.token) {
        try {
          const res = await API.events.create(data);
          id = res.id;
          data.id = id;
          data.synced = 1;
          await db.events.add(data);
        } catch(e) {
          console.warn('API create quick event failed, falling back to local:', e.message);
          id = await db.events.add(data);
        }
      } else {
        id = await db.events.add(data);
      }
      data.id = id;
      UI.toast('Auftrag erstellt', 'success');
      this.navigate('#planner/' + id);
    });
  },

  async showDayEvents(year, month, day) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const events = (await db.events.where('userId').equals(Auth.userId || 1).toArray()).filter(ev => ev.date === dateStr);
    if (!events.length) return;
    UI.toast(`${events.length} Event${events.length > 1 ? 's' : ''} am ${UI.formatDate(dateStr)}`, 'info');
    // Anzeige im Modal
    UI.openModal('Events am ' + UI.formatDate(dateStr), events.map(e => `
      <div style="padding:8px 0;border-bottom:1px solid var(--c-border);cursor:pointer" onclick="UI.closeModal();app.navigate('#planner/${e.id}')">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <strong>${e.clientName}</strong>
          ${UI.statusBadge(e.status)}
        </div>
        <div class="text-muted" style="font-size:0.8rem">${e.eventType} · ${e.locations || 'Keine Location'}</div>
      </div>
    `).join(''), null, 'narrow');
    lucide.createIcons();
  },

  // ═══════════════════════════════════════════════
  // KALENDER EXPORT (iCal .ics)
  // ═══════════════════════════════════════════════
  async exportEventToCalendar(eventId) {
    const e = await db.events.get(eventId);
    if (!e) return;
    const l = await db.locations.where('eventId').equals(eventId).first();
    const date = e.date || new Date().toISOString().slice(0,10);
    const startTime = e.startTime || '08:00';
    const endTime = e.endTime || '23:59';

    const [h, m] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);

    // ISO 8601 UTC-Zeiten für iCal
    const fmt = (y,mo,d,hr,min) => {
      return `${String(y).padStart(4,'0')}${String(mo).padStart(2,'0')}${String(d).padStart(2,'0')}T${String(hr).padStart(2,'0')}${String(min).padStart(2,'0')}00Z`;
    };
    const [y, mo, d] = date.split('-').map(Number);
    const dtStart = fmt(y, mo, d, h, m);
    const dtEnd   = fmt(y, mo, d, eh || h + 2, em || m);

    const uid = `tls-${eventId}-${e.orderNumber}@tls-events.de`;
    const description = `Auftrag: ${e.orderNumber}\\nTyp: ${e.eventType}\\nStatus: ${e.statusLabel || e.status}\\nPreis: ${UI.euro(e.totalPrice || 0)}`;
    const location = l ? `${l.name}\\n${l.address || ''}` : e.locations || 'TLS Event';

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:TLEventManager',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${e.clientName} (${e.eventType})`,
      `DESCRIPTION:${description}`,
      `LOCATION:${location.replace(/\\n/g, '\\\\n')}`,
      `STATUS:${e.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\\r\\n');

    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const filename = `${e.orderNumber || 'TLS-Event'}.ics`;
    a.setAttribute('download', filename);
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener');
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    // Safari needs the anchor element alive during async download start
    setTimeout(() => {
      if (a.parentNode) a.remove();
      URL.revokeObjectURL(url);
    }, 1000);

    UI.toast('Event als .ics exportiert – importiere es in Outlook / Google / Apple Kalender', 'success');
  },

  // ═══════════════════════════════════════════════
  // BESTANDS-KONFLIKT-PRÜFUNG (explizit)
  // ═══════════════════════════════════════════════
  async checkStockConflict(catalogItem, requestedQty, excludeEventId = null) {
    if (catalogItem.isExternal || catalogItem.stock >= 999) return { conflict: false };
    let used = 0;
    const allEvents = await db.events.where('userId').equals(Auth.userId || 1).toArray();
    for (const ev of allEvents) {
      if (excludeEventId && ev.id === excludeEventId) continue;
      const items = await db.equipmentItems.where({ eventId: ev.id, name: catalogItem.name }).toArray();
      used += items.reduce((s, i) => s + (i.qty || 1), 0);
    }
    const available = Math.max(0, catalogItem.stock - used);
    if (requestedQty > available) {
      return { conflict: true, stock: catalogItem.stock, used, available, item: catalogItem };
    }
    return { conflict: false };
  }
};

// Start app when DOM ready
document.addEventListener('DOMContentLoaded', () => app.init());