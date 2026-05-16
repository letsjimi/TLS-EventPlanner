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

  locations: {
    list: (eid)      => API.get('/api/events/' + eid + '/locations'),
    save: (eid, arr)=> API.put('/api/events/' + eid + '/locations', arr),
  },
  contacts: {
    list: (eid)      => API.get('/api/events/' + eid + '/contacts'),
    save: (eid, arr) => API.put('/api/events/' + eid + '/contacts', arr),
  },
  timeline: {
    list: (eid)      => API.get('/api/events/' + eid + '/timeline'),
    save: (eid, arr) => API.put('/api/events/' + eid + '/timeline', arr),
  },
  equipment: {
    list: (eid)      => API.get('/api/events/' + eid + '/equipment-items'),
    save: (eid, arr) => API.put('/api/events/' + eid + '/equipment-items', arr),
  },
  payments: {
    list: (eid)      => API.get('/api/events/' + eid + '/payments'),
    save: (eid, arr) => API.put('/api/events/' + eid + '/payments', arr),
  },
  todos: {
    list: (eid)      => API.get('/api/events/' + eid + '/todos'),
    save: (eid, arr) => API.put('/api/events/' + eid + '/todos', arr),
  },
  settings: {
    list: ()         => API.get('/api/settings'),
    save: (arr)      => API.put('/api/settings', arr),
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
          const body = { ...r };
          delete body.id;        // let server assign PK
          delete body.synced;    // local-only flag
          delete body.userId;    // server uses token
          const res = await API.events.create(body);
          const oldId = r.id;
          const newId = res.id;
          // Migrate local event to server id
          await db.events.delete(oldId);
          await db.events.put({ ...r, id: newId, synced: 1 });
          // Cascade update related tables
          await db.locations.where('eventId').equals(oldId).modify(l => { l.eventId = newId; });
          await db.contacts.where('eventId').equals(oldId).modify(c => { c.eventId = newId; });
          await db.timeline.where('eventId').equals(oldId).modify(t => { t.eventId = newId; });
          await db.equipmentItems.where('eventId').equals(oldId).modify(i => { i.eventId = newId; });
          await db.payments.where('eventId').equals(oldId).modify(p => { p.eventId = newId; });
          await db.eventTodos.where('eventId').equals(oldId).modify(t => { t.eventId = newId; });
          await db.eventPersonnel.where('eventId').equals(oldId).modify(p => { p.eventId = newId; });
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
          createdAt: r.created_at,
          updatedAt: r.updated_at,
          synced: 1
        };
        if (!local) await db.events.add(obj);
        else await db.events.update(r.id, obj);
        // Pull nested data for this event
        await API.sync.pullEventData(r.id);
      }
    },

    async pullEventData(eventId) {
      if (!API.token) return;
      try {
        const [locations, contacts, timeline, equipmentItems, payments, eventTodos, eventPersonnel] = await Promise.all([
          API.locations.list(eventId),
          API.contacts.list(eventId),
          API.timeline.list(eventId),
          API.equipment.list(eventId),
          API.payments.list(eventId),
          API.todos.list(eventId),
          API.personnel.list(eventId)
        ]);
        if (locations) {
          await db.locations.where('eventId').equals(eventId).delete();
          await db.locations.bulkAdd((locations || []).map(l => ({
            eventId: l.event_id, name: l.name, address: l.address, km: l.km,
            setupTime: l.setup_time, soundcheck: l.soundcheck, notes: l.notes,
            contactName: l.contact_name, contactPhone: l.contact_phone, sortOrder: l.sort_order
          })));
        }
        if (contacts) {
          await db.contacts.where('eventId').equals(eventId).delete();
          await db.contacts.bulkAdd((contacts || []).map(c => ({
            eventId: c.event_id, role: c.role, name: c.name, phone: c.phone,
            email: c.email, responsibility: c.responsibility, notes: c.notes, availability: c.availability
          })));
        }
        if (timeline) {
          await db.timeline.where('eventId').equals(eventId).delete();
          await db.timeline.bulkAdd((timeline || []).map(t => ({
            eventId: t.event_id, time: t.time, title: t.title, detail: t.detail,
            location: t.location, duration: t.duration, crew: t.crew, done: !!t.done, sortOrder: t.sort_order
          })));
        }
        if (equipmentItems) {
          await db.equipmentItems.where('eventId').equals(eventId).delete();
          await db.equipmentItems.bulkAdd((equipmentItems || []).map(it => ({
            eventId: it.event_id, category: it.category, name: it.name, qty: it.qty, unit: it.unit,
            priceDay: it.price !== undefined ? it.price : it.price_day, needed: !!it.needed, packed: !!it.packed,
            note: it.note || '', source: it.source || 'catalog', isExternal: !!it.is_external
          })));
        }
        if (payments) {
          await db.payments.where('eventId').equals(eventId).delete();
          await db.payments.bulkAdd((payments || []).map(p => ({
            eventId: p.event_id, type: p.type, amount: p.amount, dueDate: p.due_date, status: p.status
          })));
        }
        if (eventTodos) {
          await db.eventTodos.where('eventId').equals(eventId).delete();
          await db.eventTodos.bulkAdd((eventTodos || []).map(t => ({
            eventId: t.event_id, title: t.title, dueDate: t.due_date, done: !!t.done
          })));
        }
        if (eventPersonnel) {
          await db.eventPersonnel.where('eventId').equals(eventId).delete();
          await db.eventPersonnel.bulkAdd((eventPersonnel || []).map(p => ({
            eventId: p.event_id, role: p.role, qty: p.qty, unit: p.unit,
            price: p.price, needed: !!p.needed, sortOrder: p.sort_order
          })));
        }
      } catch (e) { console.warn('pullEventData failed', e); }
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
