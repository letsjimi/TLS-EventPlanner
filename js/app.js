/**
 * TLS Event Manager — Main Application
 * Router, Pages, CRUD, State Management
 */

const app = {
  currentPage: 'dashboard',
  currentEventId: null,

  // ═══════════════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════════════
  async init() {
    await seedDatabase();
    this.bindNavigation();
    this.bindMobileMenu();
    this.bindGlobalSearch();
    this.checkLock();          // Lock-Screen prüfen
    this.navigate(location.hash || '#dashboard');
    window.addEventListener('hashchange', () => this.navigate(location.hash));
    lucide.createIcons();
  },

  // ═══════════════════════════════════════════════
  // ROUTER
  // ═══════════════════════════════════════════════
  navigate(hash) {
    const raw = hash.replace('#', '') || 'dashboard';
    const [mainPage, subPage] = raw.split('/');

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

    // LOCK CHECK (ausser bei Dashboard/Market/Export-Seiten)
    this.checkLock();

    // NORMAL ROUTE
    this.currentPage = mainPage;
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
      calculation: () => this.renderCalculation(subPage),
      market:    () => this.renderMarket()
    };

    const renderer = renderers[mainPage] || renderers.dashboard;
    renderer().then(html => {
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
        if (window.innerWidth < 768) {
          document.getElementById('sidebar').classList.remove('open');
        }
      });
    });
  },

  bindMobileMenu() {
    document.getElementById('menu-toggle').addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('open');
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
  // DASHBOARD
  // ═══════════════════════════════════════════════
  async renderDashboard() {
    const events = await db.events.toArray();
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

    let html = '<div class="kanban">';
    for (const col of columns) {
      const colEvents = events.filter(e => e.status === col.key);
      html += `
        <div class="kanban-column" data-status="${col.key}">
          <div class="kanban-header">
            <div class="kanban-title" style="color:${col.color}">
              <span style="width:8px;height:8px;border-radius:50%;background:${col.color};display:inline-block"></span>
              ${col.label}
            </div>
            <span class="kanban-count">${colEvents.length}</span>
          </div>
          ${colEvents.map(e => `
            <div class="kanban-card" onclick="app.openEvent(${e.id})">
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
    // Kanban drag & drop würde hier kommen (später)
  },

  // ═══════════════════════════════════════════════
  // EVENTS LIST
  // ═══════════════════════════════════════════════
  async renderEvents(search = '') {
    let events = await db.events.toArray();
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
    const count = await db.events.count();
    const nextNum = `TLS-2026-${String(count + 1).padStart(3, '0')}`;

    const fields = [
      { name: 'orderNumber', label: 'Auftrags-Nr', placeholder: 'z.B. TLS-2026-004' },
      { name: 'date', label: 'Datum', type: 'date' },
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
        data.createdAt = new Date().toISOString();
        data.remaining = (data.totalPrice || 0) - (data.deposit || 0);
        data.statusLabel = { inquiry:'Anfrage', offer:'Angebot', inspected:'Besichtigt',
          confirmed:'Bestätigt', paid:'Bezahlt', done:'Abgeschlossen', cancelled:'Storniert' }[data.status];
        const id = await db.events.add(data);
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
        data.remaining = (data.totalPrice || 0) - (data.deposit || 0);
        data.statusLabel = { inquiry:'Anfrage', offer:'Angebot', inspected:'Besichtigt',
          confirmed:'Bestätigt', paid:'Bezahlt', done:'Abgeschlossen', cancelled:'Storniert' }[data.status];
        await db.events.update(id, data);
        UI.toast('Auftrag aktualisiert', 'success');
        this.navigate('#events');
      }
    );
  },

  async deleteEvent(id) {
    UI.confirm('Diesen Auftrag wirklich löschen? Alle zugehörigen Daten (Locations, Kontakte, Equipment) werden ebenfalls gelöscht.', async () => {
      await db.locations.where('eventId').equals(id).delete();
      await db.contacts.where('eventId').equals(id).delete();
      await db.timeline.where('eventId').equals(id).delete();
      await db.equipmentItems.where('eventId').equals(id).delete();
      await db.payments.where('eventId').equals(id).delete();
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
      const events = await db.events.toArray();
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
            ${UI.statusBadge(e.status)}
          </div>
          <h1 class="page-title">${e.clientName}</h1>
          <p class="page-subtitle">${e.eventType} · ${UI.formatDate(e.date)} · ${e.locations || 'Keine Location'}</p>
        </div>
        <div style="display:flex;gap:var(--space-sm)">
          <button class="btn btn-secondary btn-sm" onclick="app.shareEvent(${e.id})" title="Öffentlichen Link erstellen">
            <i data-lucide="share-2" style="width:16px;height:16px"></i>Teilen
          </button>
          <button class="btn btn-secondary" onclick="app.editEvent(${e.id})">
            <i data-lucide="pencil" style="width:16px;height:16px"></i>Bearbeiten
          </button>
          <button class="btn btn-ghost" onclick="app.deleteEvent(${e.id})">
            <i data-lucide="trash-2" style="width:16px;height:16px"></i>
          </button>
        </div>
      </div>

      <!-- TABS -->
      <div style="display:flex;gap:var(--space-sm);margin-bottom:var(--space-lg);border-bottom:1px solid var(--c-border);padding-bottom:var(--space-sm)">
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
      <div class="card">
        <div class="card-header">
          <div class="card-title"><i data-lucide="clock"></i>Tagesablauf</div>
          <button class="btn btn-sm btn-primary" onclick="app.addTimelineItem()">
            <i data-lucide="plus" style="width:14px;height:14px"></i>Hinzufügen
          </button>
        </div>
        ${this.renderTimeline(timeline)}
      </div>`;
  },

  renderLocations(locations) {
    return `<div style="display:flex;flex-direction:column;gap:var(--space-md)">
      ${locations.map((l, i) => `
        <div style="display:flex;gap:var(--space-md);padding:var(--space-md);background:var(--c-bg);border-radius:var(--radius-md);border:1px solid var(--c-border)">
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
                <button class="btn btn-icon btn-ghost" onclick="app.toggleTimelineDone(${t.id})"><i data-lucide="${t.done ? 'check-circle' : 'circle'}" style="width:16px;height:16px;color:${t.done ? 'var(--c-success)' : 'var(--c-text-3)'}"></i></button>
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
    const t = await db.timeline.get(id);
    await db.timeline.update(id, { done: !t.done });
    this.navigate(`#planner/${this.currentEventId}`);
  },

  async deleteTimelineItem(id) {
    UI.confirm('Position löschen?', async () => {
      await db.timeline.delete(id);
      UI.toast('Gelöscht', 'info');
      this.navigate(`#planner/${this.currentEventId}`);
    });
  },

  // ═══════════════════════════════════════════════
  // CONTACTS
  // ═══════════════════════════════════════════════
  async renderContacts(eventId, search = '') {
    if (!eventId) {
      let events = await db.events.toArray();
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

      <div style="display:flex;gap:var(--space-sm);margin-bottom:var(--space-lg);border-bottom:1px solid var(--c-border);padding-bottom:var(--space-sm)">
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
      let events = await db.events.toArray();
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

    const totalNeeded = items.filter(i => i.needed).length;
    const totalPacked = items.filter(i => i.needed && i.packed).length;
    const progress = totalNeeded > 0 ? Math.round((totalPacked / totalNeeded) * 100) : 0;

    // Pakete laden
    const packages = await db.equipmentPackages.toArray();

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
                <input type="checkbox" class="checklist-checkbox" ${item.needed ? 'checked' : ''} onchange="app.toggleEquipmentNeeded(${item.id}, this.checked)">
                <label class="checklist-label ${item.needed ? '' : 'checked'}">
                  <span style="font-weight:600">${item.name}</span>
                  <span style="color:var(--c-text-3);font-size:0.8125rem;margin-left:8px">×${item.qty}</span>
                  ${item.note ? `<span style="color:var(--c-text-3);font-size:0.8125rem;margin-left:8px">— ${item.note}</span>` : ''}
                  ${item.source === 'manual' ? `<span style="color:var(--c-warning);font-size:0.75rem;margin-left:6px">✎</span>` : ''}
                </label>
                ${item.needed ? `
                  <input type="checkbox" class="checklist-checkbox" ${item.packed ? 'checked' : ''} onchange="app.toggleEquipmentPacked(${item.id}, this.checked)" title="Gepackt">
                ` : ''}
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
          <div style="font-size:1.5rem;font-weight:700;color:var(--c-success)">${progress}%</div>
          <div style="font-size:0.75rem;color:var(--c-text-3)">${totalPacked}/${totalNeeded} gepackt</div>
        </div>
      </div>

      <div style="display:flex;gap:var(--space-sm);margin-bottom:var(--space-lg);border-bottom:1px solid var(--c-border);padding-bottom:var(--space-sm)">
        <button class="btn btn-sm btn-ghost" onclick="app.navigate('#planner/${e.id}')">📍 Planung</button>
        <button class="btn btn-sm btn-ghost" onclick="app.navigate('#contacts/${e.id}')">👥 Kontakte</button>
        <button class="btn btn-sm btn-secondary" onclick="app.navigate('#equipment/${e.id}')">🎛️ Equipment</button>
        <button class="btn btn-sm btn-ghost" onclick="app.navigate('#calculation/${e.id}')">💰 Kalkulation</button>
      </div>

      <div style="margin-bottom:var(--space-lg)">
        <div style="background:var(--c-bg);border-radius:var(--radius-md);height:8px;overflow:hidden">
          <div style="width:${progress}%;height:100%;background:var(--c-success);transition:width 500ms ease"></div>
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

  async toggleEquipmentNeeded(id, checked) {
    await db.equipmentItems.update(id, { needed: checked, packed: checked ? false : false });
    this.navigate(`#equipment/${this.currentEventId}`);
  },

  async toggleEquipmentPacked(id, checked) {
    await db.equipmentItems.update(id, { packed: checked });
    this.navigate(`#equipment/${this.currentEventId}`);
  },

  async deleteEquipmentItem(id) {
    UI.confirm('Equipment-Position löschen?', async () => {
      await db.equipmentItems.delete(id);
      UI.toast('Gelöscht', 'info');
      this.navigate(`#equipment/${this.currentEventId}`);
    });
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
      { name: 'note', label: 'Notiz', placeholder: 'z.B. Batterien prüfen' }
    ];
    UI.openModal('Equipment hinzufügen', `<form id="eq-form">${UI.form(fields)}</form>`, async () => {
      const data = UI.getFormData(document.getElementById('eq-form'));
      data.eventId = this.currentEventId;
      data.needed = true;
      data.packed = false;
      data.source = 'manual';
      data.isExternal = false;
      await db.equipmentItems.add(data);
      UI.toast('Hinzugefügt', 'success');
      this.navigate(`#equipment/${this.currentEventId}`);
    });
  },

  /* ── Katalog-Picker ── */
  async openCatalogPicker() {
    const catalog = await db.equipmentCatalog.toArray();
    const existing = await db.equipmentItems.where('eventId').equals(this.currentEventId).toArray();
    const existingNames = new Set(existing.map(e => e.name));

    // Gruppiere nach Kategorie
    const byCat = {};
    catalog.forEach(item => {
      if (!byCat[item.category]) byCat[item.category] = [];
      byCat[item.category].push(item);
    });

    const html = `
      <div style="max-height:60vh;overflow-y:auto">
        ${Object.keys(byCat).sort().map(cat => `
          <div style="margin-bottom:var(--space-md)">
            <h4 style="font-size:0.875rem;color:var(--c-text-3);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em">${cat}</h4>
            ${byCat[cat].map(item => {
              const isAdded = existingNames.has(item.name);
              const extBadge = item.isExternal ? `<span style="color:var(--c-warning);font-size:0.75rem;margin-left:6px">🌐 Miete</span>` : '';
              const tagStr = item.tags ? item.tags.slice(0, 3).map(t => `<span style="background:var(--c-bg);padding:1px 5px;border-radius:3px;font-size:0.7rem;margin-left:4px">${t}</span>`).join('') : '';
              return `
                <div style="display:flex;align-items:center;gap:var(--space-sm);padding:6px 8px;border-radius:var(--radius-sm);${isAdded ? 'opacity:0.4' : 'background:var(--c-bg-elev)'}>
                  <button class="btn btn-sm btn-primary" ${isAdded ? 'disabled' : `onclick="app.addFromCatalog(${item.id})"`} style="flex-shrink:0"><i data-lucide="plus" style="width:12px;height:12px"></i></button>
                  <div style="flex:1;min-width:0">
                    <div style="font-weight:600;font-size:0.875rem">${item.name}${extBadge}</div>
                    <div style="font-size:0.75rem;color:var(--c-text-3);display:flex;align-items:center;flex-wrap:wrap;gap:2px">${item.unit} · ${item.priceDay} €/Tag${tagStr}</div>
                  </div>
                  ${isAdded ? '<span style="font-size:0.75rem;color:var(--c-success)">✓</span>' : ''}
                </div>
              `;
            }).join('')}
          </div>
        `).join('')}
      </div>
    `;
    UI.openModal('📦 Aus Katalog hinzufügen', html, null, true);
    lucide.createIcons();
  },

  async addFromCatalog(catalogId) {
    const item = await db.equipmentCatalog.get(catalogId);
    const existing = await db.equipmentItems.where({ eventId: this.currentEventId, name: item.name }).first();
    if (existing) {
      UI.toast('Bereits in der Liste', 'warning');
      return;
    }
    await db.equipmentItems.add({
      eventId: this.currentEventId,
      category: item.category,
      name: item.name,
      qty: 1,
      needed: true,
      packed: false,
      note: '',
      source: 'catalog',
      isExternal: !!item.isExternal,
      priceDay: item.priceDay || 0
    });
    UI.toast(`${item.name} hinzugefügt`, 'success');
    // Re-render picker
    this.openCatalogPicker();
  },

  /* ── Pakete hinzufügen ── */
  async addPackage(packageName) {
    const pkg = await db.equipmentPackages.where('name').equals(packageName).first();
    if (!pkg) return;

    const catalog = await db.equipmentCatalog.toArray();
    const existing = await db.equipmentItems.where('eventId').equals(this.currentEventId).toArray();
    const existingNames = new Set(existing.map(e => e.name));

    // Finde alle Katalog-Items, deren Tags mit dem Paket übereinstimmen
    const pkgTags = new Set(pkg.tags);
    const matches = catalog.filter(item =>
      item.tags && item.tags.some(tag => pkgTags.has(tag))
    );

    let added = 0;
    for (const item of matches) {
      if (!existingNames.has(item.name)) {
        await db.equipmentItems.add({
          eventId: this.currentEventId,
          category: item.category,
          name: item.name,
          qty: 1,
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
      const events = await db.events.toArray();
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
    const catalog = await db.equipmentCatalog.toArray();
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

    // Personnel (static for now, editable later)
    const personnel = [
      { role: 'Haupttechniker (Sound/Licht)', qty: 1, unit: 'Pauschale', price: 650, needed: true },
      { role: 'Hilfskraft (Aufbau/Abbau)', qty: 1, unit: 'Pauschale', price: 200, needed: true },
      { role: 'Anfahrt', qty: e.km || 0, unit: 'km', price: 0.70, needed: true },
      { role: 'Verpflegung', qty: 2, unit: 'Pers.', price: 25, needed: true }
    ];
    let personnelTotal = personnel.reduce((s, p) => s + (p.needed ? p.price * p.qty : 0), 0);

    const netTotal = equipmentTotal + personnelTotal;
    const vat = netTotal * 0.19;
    const grossTotal = netTotal + vat;

    return `
      <div class="page-header">
        <div>
          <div style="font-size:0.875rem;color:var(--c-text-3)">${e.orderNumber}</div>
          <h1 class="page-title">Kalkulation: ${e.clientName}</h1>
        </div>
        <div style="text-align:right">
          <div style="font-size:1.75rem;font-weight:700;color:var(--c-accent)">${UI.euro(grossTotal)}</div>
          <div style="font-size:0.75rem;color:var(--c-text-3)">Gesamt brutto</div>
        </div>
      </div>

      <div style="display:flex;gap:var(--space-sm);margin-bottom:var(--space-lg);border-bottom:1px solid var(--c-border);padding-bottom:var(--space-sm)">
        <button class="btn btn-sm btn-ghost" onclick="app.navigate('#planner/${e.id}')">📍 Planung</button>
        <button class="btn btn-sm btn-ghost" onclick="app.navigate('#contacts/${e.id}')">👥 Kontakte</button>
        <button class="btn btn-sm btn-ghost" onclick="app.navigate('#equipment/${e.id}')">🎛️ Equipment</button>
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
          <div class="card-header">
            <div class="card-title">👤 Personal & Service</div>
            <div style="font-weight:700;color:var(--c-accent)">${UI.euro(personnelTotal)}</div>
          </div>
          <table class="data-table" style="font-size:0.8125rem">
            <thead><tr><th>Position</th><th>Anz.</th><th>Einheit</th><th style="text-align:right">Preis</th></tr></thead>
            <tbody>
              ${personnel.map(p => `
                <tr>
                  <td>${p.role}</td>
                  <td>${p.qty}</td>
                  <td>${p.unit}</td>
                  <td style="text-align:right">${UI.euro(p.needed ? p.price * p.qty : 0)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
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
  lockScreenHTML() {
    return `
    <div class="lock-screen" id="lock-screen">
      <div class="lock-card">
        <div class="lock-icon">🔒</div>
        <div class="lock-title">TLS Event Manager</div>
        <div class="lock-sub">Gib dein App-Passwort ein.</div>
        <form id="unlock-form" onsubmit="app.unlock(event)">
          <input type="password" name="password" placeholder="Passwort" class="form-input" style="text-align:center;margin-bottom:var(--space-md)" autocomplete="off" autofocus>
          <button type="submit" class="btn btn-primary" style="width:100%">🔓 Entsperren</button>
        </form>
      </div>
    </div>`;
  },

  async unlock(event) {
    event.preventDefault();
    const pw = document.querySelector('#unlock-form input[name=password]').value;
    const saved = await db.settings.get('appPassword');
    const current = saved ? saved.value : '';

    if (current === '' || pw === current) {
      await db.settings.put({ key: 'isLocked', value: false });
      const ls = document.getElementById('lock-screen');
      if (ls) ls.remove();
      UI.toast('Willkommen zurück', 'success');
    } else {
      UI.toast('Falsches Passwort', 'danger');
    }
  },

  async setPassword() {
    const fields = [
      { name: 'newPass', label: 'Neues Passwort', type: 'password', placeholder: 'Leer = kein Passwort' },
      { name: 'confirmPass', label: 'Wiederholen', type: 'password' }
    ];
    UI.openModal('App-Passwort setzen', `<form id="pw-form">${UI.form(fields)}</form>`, async () => {
      const d = UI.getFormData(document.getElementById('pw-form'));
      if (d.newPass !== d.confirmPass) { UI.toast('Passwörter stimmen nicht überein', 'danger'); return; }
      await db.settings.put({ key: 'appPassword', value: d.newPass || '' });
      await db.settings.put({ key: 'isLocked', value: d.newPass ? false : false });
      UI.toast(d.newPass ? 'Passwort gespeichert' : 'Passwort entfernt', 'success');
    });
  },

  async checkLock() {
    const locked = await db.settings.get('isLocked');
    const saved = await db.settings.get('appPassword');
    const needsLock = saved && saved.value && (locked ? locked.value : true);
    if (!needsLock) return;

    const existing = document.getElementById('lock-screen');
    if (existing) return;
    document.body.insertAdjacentHTML('beforeend', this.lockScreenHTML());
  },

  // ═══════════════════════════════════════════════
  // EXPORT / IMPORT
  // ═══════════════════════════════════════════════
  async exportData() {
    const data = {
      events: await db.events.toArray(),
      locations: await db.locations.toArray(),
      contacts: await db.contacts.toArray(),
      timeline: await db.timeline.toArray(),
      equipmentItems: await db.equipmentItems.toArray(),
      equipmentCatalog: await db.equipmentCatalog.toArray(),
      payments: await db.payments.toArray(),
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
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      try {
        const data = JSON.parse(text);
        await db.events.clear();
        await db.locations.clear();
        await db.contacts.clear();
        await db.timeline.clear();
        await db.equipmentItems.clear();
        await db.equipmentCatalog.clear();
        await db.payments.clear();
        if (data.events) await db.events.bulkAdd(data.events);
        if (data.locations) await db.locations.bulkAdd(data.locations);
        if (data.contacts) await db.contacts.bulkAdd(data.contacts);
        if (data.timeline) await db.timeline.bulkAdd(data.timeline);
        if (data.equipmentItems) await db.equipmentItems.bulkAdd(data.equipmentItems);
        if (data.equipmentCatalog) await db.equipmentCatalog.bulkAdd(data.equipmentCatalog);
        if (data.payments) await db.payments.bulkAdd(data.payments);
        UI.toast('Daten importiert', 'success');
        this.navigate('#dashboard');
      } catch (err) {
        UI.toast('Fehler: ' + err.message, 'error');
      }
    };
    input.click();
  }
};

// Start app when DOM ready
document.addEventListener('DOMContentLoaded', () => app.init());
