/**
 * TLS API Client
 * Bridge zwischen Dexie (local) und Express/SQLite (remote)
 */
const API = {
  base: '',
  token: null,

  headers() {
    const h = { 'Content-Type': 'application/json' };
    if (this.token) h['Authorization'] = 'Bearer ' + this.token;
    return h;
  },

  async req(method, path, body) {
    const opts = { method, headers: this.headers() };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(this.base + path, opts);
    if (res.status === 401) { this.token = null; localStorage.removeItem('jwt'); throw new Error('Unauthorized'); }
    if (!res.ok) throw new Error((await res.json()).error || res.statusText);
    return res.status === 204 ? null : await res.json();
  },

  get(path)   { return this.req('GET', path); },
  post(path, body) { return this.req('POST', path, body); },
  put(path, body)  { return this.req('PUT', path, body); },
  del(path)   { return this.req('DELETE', path); },

  auth: {
    login: (u, p)    => API.post('/api/auth/login', { username: u, password: p }),
    register: (u, p, dn) => API.post('/api/auth/register', { username: u, password: p, displayName: dn }),
    me: ()           => API.get('/api/auth/me'),
  },

  events: {
    list: ()         => API.get('/api/events'),
    create: (d)      => API.post('/api/events', d),
    update: (id, d)  => API.put('/api/events/' + id, d),
    remove: (id)     => API.del('/api/events/' + id),
  },

  personnel: {
    list: (eid)      => API.get('/api/events/' + eid + '/personnel'),
    save: (eid, arr) => API.put('/api/events/' + eid + '/personnel', arr),
  },

  catalog: {
    list: ()         => API.get('/api/equipment-catalog'),
    create: (d)      => API.post('/api/equipment-catalog', d),
    update: (id, d)  => API.put('/api/equipment-catalog/' + id, d),
    remove: (id)     => API.del('/api/equipment-catalog/' + id),
  },

  packages: {
    list: ()         => API.get('/api/equipment-packages'),
    create: (d)      => API.post('/api/equipment-packages', d),
    update: (id, d)  => API.put('/api/equipment-packages/' + id, d),
    remove: (id)     => API.del('/api/equipment-packages/' + id),
  },

  export: {
    full: ()         => API.get('/api/export/full'),
    csv:  ()         => fetch(API.base + '/api/export/events.csv', { headers: API.headers() }),
  },

  import: {
    full: (data)     => API.post('/api/import/full', data),
  },

  sync: {
    async pushAll() {
      if (!API.token) return;
      const rows = await db.events.where('synced').equals(0).toArray();
      for (const r of rows) {
        try {
          await API.events.create(r);
          await db.events.update(r.id, { synced: 1 });
        } catch (e) { console.warn('Sync event failed', e); }
      }
    },

    async pullEvents() {
      if (!API.token) return;
      const remote = await API.events.list();
      for (const r of remote) {
        const local = await db.events.get(r.id);
        const statusMap = { inquiry:'Anfrage', offer:'Angebot', inspected:'Besichtigt', confirmed:'Bestätigt', paid:'Bezahlt', done:'Abgeschlossen', cancelled:'Storniert' };
        const obj = {
          id: r.id,
          userId: r.user_id,
          orderNumber: r.order_number,
          orderType: r.order_type || 'event',
          status: r.status,
          statusLabel: statusMap[r.status] || r.status,
          eventType: r.event_type,
          date: r.date,
          clientName: r.client_name,
          locations: r.locations,
          totalPrice: r.total_price,
          deposit: r.deposit,
          remaining: r.remaining,
          notes: r.notes,
          km: r.km,
          duration: r.duration || 1,
          synced: 1
        };
        if (!local) await db.events.add(obj);
        else await db.events.update(r.id, obj);
      }
    },

    async pushCatalog() {
      if (!API.token) return;
      const rows = await db.equipmentCatalog.where('synced').equals(0).toArray();
      for (const r of rows) {
        try {
          await API.catalog.create(r);
          await db.equipmentCatalog.update(r.id, { synced: 1 });
        } catch (e) { console.warn('Sync catalog failed', e); }
      }
    },

    async pullCatalog() {
      if (!API.token) return;
      const remote = await API.catalog.list();
      for (const r of remote) {
        const obj = {
          id: r.id,
          userId: r.user_id,
          category: r.category,
          name: r.name,
          tags: r.tags,
          unit: r.unit,
          priceDay: r.price_day,
          stock: r.stock || 1,
          isExternal: r.is_external,
          synced: 1
        };
        const local = await db.equipmentCatalog.get(r.id);
        if (!local) await db.equipmentCatalog.add(obj);
        else await db.equipmentCatalog.update(r.id, obj);
      }
    },

    async all() {
      await API.sync.pullEvents();
      await API.sync.pushAll();
      await API.sync.pullCatalog();
      await API.sync.pushCatalog();
    }
  }
};

// Auto-load token
API.token = localStorage.getItem('jwt') || null;
