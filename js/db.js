/**
 * TLS Event Manager — IndexedDB Schema (Dexie.js)
 * Alle Daten client-side, offline-fähig
 */

const db = new Dexie('TLS_EventManager_v3');

db.version(5).stores({
  events: '++id, userId, orderNumber, status, eventType, date, clientName, totalPrice',
  locations: '++id, eventId, sortOrder',
  contacts: '++id, eventId, role, name',
  timeline: '++id, eventId, time, sortOrder',
  equipmentItems: '++id, eventId, category, name, needed',
  equipmentCatalog: '++id, userId, category, name, tags, isExternal',
  equipmentPackages: '++id, userId, name, tags',
  payments: '++id, eventId, type, status',
  settings: 'userId, key',
  eventTodos: '++id, eventId, dueDate, done',
  users: '++id, username'
}).upgrade(async tx => {
  // Migration: Tag-basierte Pakete → Item-basierte Pakete
  const packages = await tx.equipmentPackages.toArray();
  const catalog  = await tx.equipmentCatalog.toArray();
  for (const pkg of packages) {
    if (pkg.items && Array.isArray(pkg.items)) continue; // bereits migriert
    const pkgTags = new Set(pkg.tags || []);
    const items = [];
    let sortOrder = 1;
    for (const cat of catalog) {
      if (cat.tags && cat.tags.some(t => pkgTags.has(t))) {
        items.push({
          name: cat.name,
          qty: 1,
          group: cat.category || 'Standard',
          sortOrder: sortOrder++
        });
      }
    }
    if (items.length > 0) {
      await tx.equipmentPackages.update(pkg.id, { items });
    }
  }
});

db.version(4).stores({
  events: '++id, userId, orderNumber, status, eventType, date, clientName, totalPrice',
  locations: '++id, eventId, sortOrder',
  contacts: '++id, eventId, role, name',
  timeline: '++id, eventId, time, sortOrder',
  equipmentItems: '++id, eventId, category, name, needed',
  equipmentCatalog: '++id, userId, category, name, tags, isExternal',
  equipmentPackages: '++id, userId, name, tags',
  payments: '++id, eventId, type, status',
  settings: 'userId, key',
  eventTodos: '++id, eventId, dueDate, done',
  users: '++id, username'
}).upgrade(tx => {
  // Migration: Alle bestehenden Daten auf userId 1 (Timon) zuweisen
  return Promise.all([
    tx.events.toCollection().modify(e => { if (!e.userId) e.userId = 1; }),
    tx.equipmentCatalog.toCollection().modify(c => { if (!c.userId) c.userId = 1; }),
    tx.equipmentPackages.toCollection().modify(p => { if (!p.userId) p.userId = 1; }),
    tx.settings.toCollection().modify(s => { if (!s.userId) s.userId = 1; }),
  ]);
});

db.version(2).stores({
  events: '++id, orderNumber, status, eventType, date, clientName, totalPrice',
  locations: '++id, eventId, sortOrder',
  contacts: '++id, eventId, role, name',
  timeline: '++id, eventId, time, sortOrder',
  equipmentItems: '++id, eventId, category, name, needed',
  equipmentCatalog: '++id, category, name, tags, isExternal',
  equipmentPackages: '++id, name, tags',
  payments: '++id, eventId, type, status',
  settings: 'key',
  eventTodos: '++id, eventId, dueDate, done'
}).upgrade(tx => {
  // Migration: Default stock = 1 für existierende Katalog-Items
  return tx.equipmentCatalog.toCollection().modify(item => {
    if (item.stock === undefined) item.stock = 1;
  });
});

db.version(1).stores({
  events: '++id, orderNumber, status, eventType, date, clientName, totalPrice',
  locations: '++id, eventId, sortOrder',
  contacts: '++id, eventId, role, name',
  timeline: '++id, eventId, time, sortOrder',
  equipmentItems: '++id, eventId, category, name, needed',
  equipmentCatalog: '++id, category, name, tags, isExternal',
  equipmentPackages: '++id, name, tags',
  payments: '++id, eventId, type, status',
  settings: 'key'
});

/* ═══════════════════════════════════════════════
   SEED DATA (Initial-Daten aus der Excel)
   ═══════════════════════════════════════════════ */

async function seedDatabase() {
  const uid = Auth.userId || 1;
  if (uid !== 1) return; // Seed-Daten nur für den ersten Account (Timon)

  const count = await db.events.where('userId').equals(uid).count();
  if (count > 0) {
    // Prüfe ob alte Seed-Daten (Juni/August) vorhanden sind
    const oldSeed = await db.events.where('userId').equals(uid).and(e => e.date >= '2026-06-01' && e.date <= '2026-08-31').toArray();
    if (oldSeed.length === 0) return; // Benutzer hat eigene Daten → nicht überschreiben
    // Alte Seed-Daten gefunden → alle Seed-relevanten Tabellen löschen und neu seeden
    const userEvents = await db.events.where('userId').equals(uid).toArray();
    const userEventIds = userEvents.map(e => e.id);
    for (const eid of userEventIds) {
      await db.locations.where('eventId').equals(eid).delete();
      await db.contacts.where('eventId').equals(eid).delete();
      await db.timeline.where('eventId').equals(eid).delete();
      await db.equipmentItems.where('eventId').equals(eid).delete();
      await db.payments.where('eventId').equals(eid).delete();
      await db.eventTodos.where('eventId').equals(eid).delete();
    }
    await db.events.where('userId').equals(uid).delete();
    await db.equipmentPackages.where('userId').equals(uid).delete();
  }

  // ── Events (userId = 1) ──
  const ev1 = await db.events.add({
    userId: 1, orderNumber: 'TLS-2026-001', date: '2026-05-10', eventType: 'Hochzeit',
    clientName: 'Schneider & Müller', locations: 'Kirche St. Peter → Festhalle Rüsselsheim',
    totalPrice: 2850.00, deposit: 850.00, remaining: 2000.00, status: 'confirmed',
    statusLabel: 'Bestätigt',
    notes: 'Location-Wechsel! 2x Setup nötig. Braut wünscht sanfte Beleuchtung während Dinner.',
    duration: 1, km: 90, createdAt: new Date().toISOString()
  });
  const ev2 = await db.events.add({
    userId: 1, orderNumber: 'TLS-2026-002', date: '2026-05-20', eventType: 'Firmenfeier',
    clientName: 'ABC GmbH Frankfurt', locations: 'Kongresszentrum Frankfurt',
    totalPrice: 1850.00, deposit: 500.00, remaining: 1350.00, status: 'offer',
    statusLabel: 'Angebot',
    notes: 'Catering-Abstimmung offen. Firmenlogo auf LED-Wall gewünscht.',
    duration: 1, km: 25, createdAt: new Date().toISOString()
  });
  const ev3 = await db.events.add({
    userId: 1, orderNumber: 'TLS-2026-003', date: '2026-06-05', eventType: 'Konzert',
    clientName: 'Musikverein Darmstadt', locations: 'Jazzclub Darmstadt',
    totalPrice: 1200.00, deposit: 0, remaining: 1200.00, status: 'inquiry',
    statusLabel: 'Anfrage',
    notes: 'Line-In für Band vorhanden. 4-Kanal Mischpult ausreichend.',
    duration: 1, km: 35, createdAt: new Date().toISOString()
  });

  // ── Locations (für Event 001) ──
  await db.locations.bulkAdd([
    { eventId: 1, sortOrder: 1, name: 'Kirche St. Peter', address: 'Hauptstraße 12, 65428 Rüsselsheim',
      km: 45, setupTime: '09:00 - 10:00', soundcheck: '10:00 - 10:30',
      notes: 'Trauung 11:00 Uhr | 2x Drahtlos | nur Beschallung, kein DJ',
      contactName: 'Pfarrer Müller', contactPhone: '0176/123456' },
    { eventId: 1, sortOrder: 2, name: 'Festhalle Rüsselsheim', address: 'Am Festplatz 5, 65428 Rüsselsheim',
      km: 0, setupTime: '14:00 - 16:00', soundcheck: '16:00 - 17:00',
      notes: 'Empfang ab 17:00 | Dinner 18:00 | Party ab 20:00 | Ende 01:00',
      contactName: 'Verwalter Schmidt', contactPhone: '06142/98765' },
    { eventId: 2, sortOrder: 1, name: 'Kongresszentrum Frankfurt', address: 'Ludwig-Erhard-Anlage 1, 60327 Frankfurt',
      km: 25, setupTime: '10:00 - 12:00', soundcheck: '12:00 - 13:00',
      notes: 'LED-Wall mit Firmenlogo | 200 Gäste | Parkplatz B3',
      contactName: 'Frau Weber', contactPhone: '069/1234567' },
    { eventId: 3, sortOrder: 1, name: 'Jazzclub Darmstadt', address: 'Rheinstraße 15, 64283 Darmstadt',
      km: 35, setupTime: '16:00 - 18:00', soundcheck: '18:00 - 19:00',
      notes: '4-Kanal Mischpult ausreichend | Line-In bereit',
      contactName: 'Herr Krause', contactPhone: '06151/987654' }
  ]);

  // ── Timeline (für Event 001) ──
  await db.timeline.bulkAdd([
    { eventId: 1, time: '06:00', title: 'Abfahrt TLS', detail: 'Equipment verladen', location: 'TLS Lager', duration: '1h', crew: 'Techniker + Helfer', done: true },
    { eventId: 1, time: '07:30', title: 'Ankunft Location 1', detail: 'Kirche St. Peter', location: 'Rüsselsheim', duration: '0,5h', crew: 'Techniker', done: true },
    { eventId: 1, time: '08:00', title: 'Aufbau Location 1', detail: 'PA aufstellen, Drahtlos-Mikros', location: 'Kirche', duration: '1,5h', crew: 'Techniker + Helfer', done: false },
    { eventId: 1, time: '09:30', title: 'Soundcheck Kirche', detail: 'Akustik-Check, Rückkopplung', location: 'Kirche', duration: '0,5h', crew: 'Techniker', done: false },
    { eventId: 1, time: '11:00', title: 'Trauung', detail: 'Beschallung Trauung', location: 'Kirche', duration: '1h', crew: 'Techniker (Standby)', done: false },
    { eventId: 1, time: '12:30', title: 'Abbau Kirche', detail: 'Equipment einpacken', location: 'Kirche', duration: '1h', crew: 'Techniker + Helfer', done: false },
    { eventId: 1, time: '14:00', title: 'Aufbau Location 2', detail: 'Festhalle: PA, Licht, DJ-Setup', location: 'Festhalle', duration: '2h', crew: 'Techniker + Helfer', done: false },
    { eventId: 1, time: '16:00', title: 'Soundcheck Festhalle', detail: 'Full-System Check', location: 'Festhalle', duration: '1h', crew: 'Techniker', done: false },
    { eventId: 1, time: '17:00', title: 'Empfang', detail: 'Hintergrundmusik', location: 'Festhalle', duration: '1h', crew: 'Techniker', done: false },
    { eventId: 1, time: '18:00', title: 'Dinner', detail: 'Dinner-Musik / Mikros für Reden', location: 'Festhalle', duration: '2h', crew: 'Techniker', done: false },
    { eventId: 1, time: '20:00', title: 'Party / DJ', detail: 'Tanzmusik, Moderation', location: 'Festhalle', duration: '5h', crew: 'Techniker', done: false },
    { eventId: 1, time: '01:00', title: 'Abbau Festhalle', detail: 'Alles einpacken', location: 'Festhalle', duration: '1,5h', crew: 'Techniker + Helfer', done: false },
    { eventId: 1, time: '03:00', title: 'Rückkehr TLS', detail: 'Equipment abladen', location: 'TLS Lager', duration: '1h', crew: 'Techniker + Helfer', done: false }
  ]);

  // ── Timeline (für Event 002) ──
  await db.timeline.bulkAdd([
    { eventId: 2, time: '10:00', title: 'Aufbau', detail: 'PA, Licht, LED-Wall', location: 'Kongresszentrum', duration: '2h', crew: 'Techniker + Helfer', done: false },
    { eventId: 2, time: '12:00', title: 'Soundcheck', detail: 'Full-System', location: 'Kongresszentrum', duration: '1h', crew: 'Techniker', done: false },
    { eventId: 2, time: '18:00', title: 'Empfang', detail: 'Hintergrundmusik', location: 'Kongresszentrum', duration: '2h', crew: 'Techniker', done: false },
    { eventId: 2, time: '20:00', title: 'Firmenfeier', detail: 'DJ-Set, Mikros für Reden', location: 'Kongresszentrum', duration: '4h', crew: 'Techniker', done: false },
    { eventId: 2, time: '00:00', title: 'Abbau', detail: 'Equipment einpacken', location: 'Kongresszentrum', duration: '1,5h', crew: 'Techniker + Helfer', done: false }
  ]);

  // ── Timeline (für Event 003) ──
  await db.timeline.bulkAdd([
    { eventId: 3, time: '16:00', title: 'Aufbau', detail: 'PA, Licht', location: 'Jazzclub', duration: '2h', crew: 'Techniker', done: false },
    { eventId: 3, time: '18:00', title: 'Soundcheck', detail: 'Band-Line-Check', location: 'Jazzclub', duration: '1h', crew: 'Techniker', done: false },
    { eventId: 3, time: '20:00', title: 'Konzert', detail: 'Bühnenshow', location: 'Jazzclub', duration: '3h', crew: 'Techniker', done: false },
    { eventId: 3, time: '23:30', title: 'Abbau', detail: 'Equipment einpacken', location: 'Jazzclub', duration: '1h', crew: 'Techniker', done: false }
  ]);

  // ── Contacts (für Event 001) ──
  await db.contacts.bulkAdd([
    { eventId: 1, role: 'Brautpaar / Kunde', name: 'Lisa Schneider & Tom Müller', phone: '0176/12345678',
      email: 'hochzeit@mail.de', responsibility: 'Hauptansprech, Vertrag, Zahlung',
      notes: 'Braut wünscht sanfte Beleuchtung während Dinner', availability: 'Jederzeit' },
    { eventId: 1, role: 'Location-Kontakt 1', name: 'Pfarrer Müller', phone: '0176/111222',
      email: 'pfarramt@kirche.de', responsibility: 'Kirchen-Zugang, Aufbau-Zeiten',
      notes: 'Soundcheck nur nach Absprache', availability: 'Vormittags' },
    { eventId: 1, role: 'Location-Kontakt 2', name: 'Herr Schmidt (Festhalle)', phone: '06142/987654',
      email: 'festhalle@ruesselsheim.de', responsibility: 'Schlüssel, Stromanschlüsse, Regeln',
      notes: '3x Schuko 16A verfügbar | kein Rauchen in der Halle', availability: 'Bürozeiten' },
    { eventId: 1, role: 'Catering', name: 'Gourmet Events GmbH', phone: '06151/555444',
      email: 'info@gourmet-events.de', responsibility: 'Menü, Zeiten, Mikros für Reden',
      notes: 'Buffet 18:30 | Reden während Dinner | 2x Funkmikro', availability: 'Mo-Fr 9-17h' },
    { eventId: 1, role: 'Fotograf', name: 'Anna Lena Photo', phone: '0176/999888',
      email: 'anna@lena-photo.de', responsibility: 'Licht für Fotos, First Dance Timing',
      notes: 'Bitte keine Spot-Effekte während Zeremonie', availability: 'Jederzeit' },
    { eventId: 1, role: 'Hochzeitsplaner', name: 'Perfect Day Events', phone: '0176/777666',
      email: 'hello@perfectday.de', responsibility: 'Ablauf-Koordination',
      notes: 'Sendet finale Timeline 1 Woche vorher', availability: 'Mo-Sa 10-20h' },
    { eventId: 1, role: 'TLS-Helfer', name: 'Max Mustermann', phone: '0176/444333',
      email: 'max@mail.de', responsibility: 'Equipment-Transport, Aufbau-Hilfe',
      notes: 'Hat Führerschein Klasse C1', availability: 'Jederzeit' }
  ]);

  // ── Contacts (für Event 002) ──
  await db.contacts.bulkAdd([
    { eventId: 2, role: 'Kunde / Auftraggeber', name: 'ABC GmbH - Herr Becker', phone: '069/2345678',
      email: 'events@abc-gmbh.de', responsibility: 'Vertrag, Rechnung, Zahlung',
      notes: 'Firmen-CI beachten | Logo auf LED-Wall gewünscht', availability: 'Mo-Fr 9-18h' },
    { eventId: 2, role: 'Location-Kontakt', name: 'Frau Weber', phone: '069/1234567',
      email: 'events@kongresszentrum.de', responsibility: 'Technische Anschlüsse, Parkplätze',
      notes: 'Parkplatz B3 reserviert | Cateringbereich EG', availability: 'Bürozeiten' }
  ]);

  // ── Contacts (für Event 003) ──
  await db.contacts.bulkAdd([
    { eventId: 3, role: 'Kunde / Veranstalter', name: 'Musikverein Darmstadt - Frau Lenz', phone: '06151/765432',
      email: 'info@musikverein-darmstadt.de', responsibility: 'Vertrag, Presse, Zahlung',
      notes: 'Line-In vorhanden | 4-Kanal reicht', availability: 'Jederzeit' }
  ]);

  // ── Contacts (für Event 002) ──
  await db.contacts.bulkAdd([
    { eventId: 2, role: 'Kunde / Auftraggeber', name: 'ABC GmbH - Herr Becker', phone: '069/2345678',
      email: 'events@abc-gmbh.de', responsibility: 'Vertrag, Rechnung, Zahlung',
      notes: 'Firmen-CI beachten | Logo auf LED-Wall gewünscht', availability: 'Mo-Fr 9-18h' },
    { eventId: 2, role: 'Location-Kontakt', name: 'Frau Weber', phone: '069/1234567',
      email: 'events@kongresszentrum.de', responsibility: 'Technische Anschlüsse, Parkplätze',
      notes: 'Parkplatz B3 reserviert | Cateringbereich EG', availability: 'Bürozeiten' }
  ]);

  // ── Contacts (für Event 003) ──
  await db.contacts.bulkAdd([
    { eventId: 3, role: 'Kunde / Veranstalter', name: 'Musikverein Darmstadt - Frau Lenz', phone: '06151/765432',
      email: 'info@musikverein-darmstadt.de', responsibility: 'Vertrag, Presse, Zahlung',
      notes: 'Line-In vorhanden | 4-Kanal reicht', availability: 'Jederzeit' }
  ]);

  // ── Equipment Catalog (TLS Lager) ──
  await db.equipmentCatalog.bulkAdd([
    { userId: 1, category: 'Mischpult', name: 'Allen & Heath SQ6 + Waves', unit: 'Stk', priceDay: 115, stock: 1, tags: ['PA','Mischpult','Band','Hochzeit'], isExternal: false },
    { userId: 1, category: 'Mischpult', name: 'iPad für SQ-MixPad', unit: 'Stk', priceDay: 0, stock: 1, tags: ['PA','Mischpult','Band','Hochzeit'], isExternal: false },
    { userId: 1, category: 'Lautsprecher', name: 'LD Systems ICOA 12 Pro A (Top)', unit: 'Stk', priceDay: 24, stock: 4, tags: ['PA','Top','Band','Hochzeit'], isExternal: false },
    { userId: 1, category: 'Lautsprecher', name: 'Eigenbau Subwoofer Doppel-18\" 3600W', unit: 'Stk', priceDay: 42.5, stock: 2, tags: ['PA','Sub','Band','Hochzeit'], isExternal: false },
    { userId: 1, category: 'Lautsprecher', name: 'Lautsprecher-Ständer', unit: 'Stk', priceDay: 3.5, stock: 8, tags: ['PA','Top','Stand'], isExternal: false },
    { userId: 1, category: 'Mikrofone', name: 'Shure SM58 (Kabel)', unit: 'Stk', priceDay: 3.5, stock: 6, tags: ['Mikro','Band','Hochzeit','Rede'], isExternal: false },
    { userId: 1, category: 'Mikrofone', name: 'Shure SM58 Funkmikrofon-Set', unit: 'Set', priceDay: 25, stock: 2, tags: ['Mikro','Funk','Hochzeit','Rede'], isExternal: false },
    { userId: 1, category: 'Mikrofone', name: 'Shure Beta 91A (Kick)', unit: 'Stk', priceDay: 8, stock: 1, tags: ['Mikro','Band','Kick'], isExternal: false },
    { userId: 1, category: 'Mikrofone', name: 'Shure Beta 57A (Snare)', unit: 'Stk', priceDay: 7, stock: 2, tags: ['Mikro','Band','Snare'], isExternal: false },
    { userId: 1, category: 'Mikrofone', name: 'Shure PGA98H (Tom)', unit: 'Stk', priceDay: 6, stock: 3, tags: ['Mikro','Band','Tom'], isExternal: false },
    { userId: 1, category: 'DI-Boxen', name: 'Passive DI-Boxen', unit: 'Stk', priceDay: 3, stock: 6, tags: ['DI','Band','Line'], isExternal: false },
    { userId: 1, category: 'Licht', name: 'LED Washer RGB (36x)', unit: 'Stk', priceDay: 3, stock: 16, tags: ['Licht','LED','Hochzeit'], isExternal: false },
    { userId: 1, category: 'Licht', name: 'Lichtständer / Traversen', unit: 'Stk', priceDay: 5, stock: 6, tags: ['Licht','Traverse','Hochzeit'], isExternal: false },
    { userId: 1, category: 'Licht', name: 'DMX-Controller', unit: 'Set', priceDay: 15, stock: 1, tags: ['Licht','DMX','Hochzeit'], isExternal: false },
    { userId: 1, category: 'Kabel', name: 'XLR-Kabel (verschiedene Längen)', unit: 'Stk', priceDay: 1, stock: 30, tags: ['Kabel','XLR','Band','PA'], isExternal: false },
    { userId: 1, category: 'Kabel', name: 'Schuko-Verlängerungen', unit: 'Stk', priceDay: 2, stock: 10, tags: ['Kabel','Strom','PA'], isExternal: false },
    { userId: 1, category: 'Kabel', name: 'Multicore / Stagebox', unit: 'Set', priceDay: 20, stock: 1, tags: ['Kabel','Multicore','Band','PA'], isExternal: false },
    { userId: 1, category: 'DJ', name: 'DJ-Controller / Laptop', unit: 'Set', priceDay: 0, stock: 1, tags: ['DJ','Laptop','Hochzeit','Party'], isExternal: false },
    { userId: 1, category: 'DJ', name: 'DJ-Booth-Monitore', unit: 'Stk', priceDay: 12, stock: 2, tags: ['DJ','Monitor','Hochzeit'], isExternal: false },
    { userId: 1, category: 'Zubehör', name: 'Gaffa-Tape', unit: 'Rolle', priceDay: 2, stock: 10, tags: ['Zubehör','Tape','Kabel'], isExternal: false },
    { userId: 1, category: 'Zubehör', name: 'Kabelbinder', unit: 'Pack', priceDay: 1, stock: 20, tags: ['Zubehör','Kabel'], isExternal: false },
    { userId: 1, category: 'Zubehör', name: 'Multimeter', unit: 'Stk', priceDay: 2, stock: 1, tags: ['Zubehör','Werkzeug'], isExternal: false },
    { userId: 1, category: 'Zubehör', name: 'Werkzeugkoffer', unit: 'Set', priceDay: 5, stock: 1, tags: ['Zubehör','Werkzeug'], isExternal: false },
    { userId: 1, category: 'Zubehör', name: 'Batterien AA / 9V', unit: 'Pack', priceDay: 3, stock: 15, tags: ['Zubehör','Batterien','Funk'], isExternal: false },
    // ── Externe Miete (kein Stock nötig, wird extern bestellt) ──
    { userId: 1, category: 'Mischpult', name: 'Behringer X32 (Miete)', unit: 'Stk', priceDay: 85, stock: 999, tags: ['PA','Mischpult','Band','Miete'], isExternal: true },
    { userId: 1, category: 'Lautsprecher', name: 'dB Technologies ES1203 (Miete)', unit: 'Stk', priceDay: 65, stock: 999, tags: ['PA','Top','Sub','Miete'], isExternal: true },
    { userId: 1, category: 'Licht', name: 'Moving Head Spot (Miete)', unit: 'Stk', priceDay: 35, stock: 999, tags: ['Licht','Moving','Miete'], isExternal: true }
  ]);

  // ── Equipment Packages ──
  await db.equipmentPackages.bulkAdd([
    { userId: 1, name: 'PA-Anlage', description: 'Komplettsystem mit Tops, Subs, Ständen, Kabel', tags: ['PA','Top','Sub','Stand','Kabel'] },
    { userId: 1, name: 'DJ-Setup', description: 'DJ-Pult + Monitore + Laptop', tags: ['DJ','Monitor','Laptop'] },
    { userId: 1, name: 'Band-Schlagzeug', description: 'Kick-Mikro + Snare-Mikro + Tom-Mikros + DI', tags: ['Kick','Snare','Tom','DI'] },
    { userId: 1, name: 'Hochzeit-Basic', description: 'PA + Funkmikros + Licht Grundausstattung', tags: ['PA','Funk','Licht','LED'] },
    { userId: 1, name: 'Band-Komplett', description: 'Full-Band-Setup mit Mischpult, PA, Mikros, DI', tags: ['PA','Mischpult','Top','Sub','Mikro','DI','Band'] }
  ]);

  // ── Equipment Items (für Event 001) ──
  await db.equipmentItems.bulkAdd([
    { eventId: 1, category: 'Mischpult', name: 'Allen & Heath SQ6 + Waves', qty: 1, needed: true, packed: false, note: '', source: 'catalog', isExternal: false, priceDay: 115 },
    { eventId: 1, category: 'Mischpult', name: 'iPad für SQ-MixPad', qty: 1, needed: true, packed: false, note: 'WLAN-Router nicht vergessen!', source: 'catalog', isExternal: false, priceDay: 0 },
    { eventId: 1, category: 'Lautsprecher', name: 'LD Systems ICOA 12 Pro A (Top)', qty: 2, needed: true, packed: false, note: '', source: 'catalog', isExternal: false, priceDay: 24 },
    { eventId: 1, category: 'Lautsprecher', name: 'Eigenbau Subwoofer Doppel-18\" 3600W', qty: 2, needed: true, packed: false, note: 'Schwer! Kran/2 Personen', source: 'catalog', isExternal: false, priceDay: 42.5 },
    { eventId: 1, category: 'Lautsprecher', name: 'Lautsprecher-Ständer', qty: 4, needed: true, packed: false, note: '', source: 'catalog', isExternal: false, priceDay: 3.5 },
    { eventId: 1, category: 'Mikrofone', name: 'Shure SM58 (Kabel)', qty: 4, needed: true, packed: false, note: '', source: 'catalog', isExternal: false, priceDay: 3.5 },
    { eventId: 1, category: 'Mikrofone', name: 'Shure SM58 Funkmikrofon-Set', qty: 2, needed: true, packed: false, note: 'Batterien prüfen!', source: 'catalog', isExternal: false, priceDay: 25 },
    { eventId: 1, category: 'Mikrofone', name: 'Shure Beta 91A (Kick)', qty: 1, needed: true, packed: false, note: 'nur bei Band', source: 'catalog', isExternal: false, priceDay: 8 },
    { eventId: 1, category: 'Mikrofone', name: 'Shure Beta 57A (Snare)', qty: 2, needed: true, packed: false, note: '', source: 'catalog', isExternal: false, priceDay: 7 },
    { eventId: 1, category: 'Mikrofone', name: 'Shure PGA98H (Tom)', qty: 2, needed: true, packed: false, note: '', source: 'catalog', isExternal: false, priceDay: 6 },
    { eventId: 1, category: 'DI-Boxen', name: 'Passive DI-Boxen', qty: 4, needed: true, packed: false, note: '', source: 'catalog', isExternal: false, priceDay: 3 },
    { eventId: 1, category: 'Licht', name: 'LED Washer RGB (36x)', qty: 12, needed: true, packed: false, note: 'DMX-Kabel', source: 'catalog', isExternal: false, priceDay: 3 },
    { eventId: 1, category: 'Licht', name: 'Lichtständer / Traversen', qty: 4, needed: true, packed: false, note: '', source: 'catalog', isExternal: false, priceDay: 5 },
    { eventId: 1, category: 'Licht', name: 'DMX-Controller', qty: 1, needed: true, packed: false, note: '', source: 'catalog', isExternal: false, priceDay: 15 },
    { eventId: 1, category: 'Kabel', name: 'XLR-Kabel (verschiedene Längen)', qty: 20, needed: true, packed: false, note: '', source: 'catalog', isExternal: false, priceDay: 1 },
    { eventId: 1, category: 'Kabel', name: 'Schuko-Verlängerungen', qty: 6, needed: true, packed: false, note: '', source: 'catalog', isExternal: false, priceDay: 2 },
    { eventId: 1, category: 'Kabel', name: 'Multicore / Stagebox', qty: 1, needed: true, packed: false, note: '', source: 'catalog', isExternal: false, priceDay: 20 },
    { eventId: 1, category: 'DJ', name: 'DJ-Controller / Laptop', qty: 1, needed: true, packed: false, note: 'Rekordbox / Serato', source: 'catalog', isExternal: false, priceDay: 0 },
    { eventId: 1, category: 'DJ', name: 'DJ-Booth-Monitore', qty: 2, needed: true, packed: false, note: '', source: 'catalog', isExternal: false, priceDay: 12 },
    { eventId: 1, category: 'Zubehör', name: 'Gaffa-Tape', qty: 3, needed: true, packed: false, note: '', source: 'catalog', isExternal: false, priceDay: 2 },
    { eventId: 1, category: 'Zubehör', name: 'Kabelbinder', qty: 50, needed: true, packed: false, note: '', source: 'catalog', isExternal: false, priceDay: 1 },
    { eventId: 1, category: 'Zubehör', name: 'Batterien AA / 9V', qty: 20, needed: true, packed: false, note: 'Für Funkmikros', source: 'catalog', isExternal: false, priceDay: 3 }
  ]);

  // ── Equipment Items (für Event 002 – Firmenfeier ABC GmbH) ──
  await db.equipmentItems.bulkAdd([
    { eventId: 2, category: 'Mischpult',  name: 'dB Technologies M12A (Top)', qty: 4,  needed: true, packed: false, note: '', source: 'catalog', isExternal: false, priceDay: 24 },
    { eventId: 2, category: 'Lautsprecher', name: 'dB Technologies S18A (Sub)', qty: 2,  needed: true, packed: false, note: '', source: 'catalog', isExternal: false, priceDay: 42.5 },
    { eventId: 2, category: 'Licht', name: 'LED Washer RGB (36x)', qty: 8, needed: true, packed: false, note: 'DMX-Kabel', source: 'catalog', isExternal: false, priceDay: 3 },
    { eventId: 2, category: 'Licht', name: 'DMX-Controller', qty: 1, needed: true, packed: false, note: '', source: 'catalog', isExternal: false, priceDay: 15 },
    { eventId: 2, category: 'Mikrofone', name: 'Shure SM58 Funkmikrofon-Set', qty: 2, needed: true, packed: false, note: 'Batterien prüfen!', source: 'catalog', isExternal: false, priceDay: 25 },
    { eventId: 2, category: 'DJ', name: 'DJ-Controller / Laptop', qty: 1, needed: true, packed: false, note: 'Rekordbox / Serato', source: 'catalog', isExternal: false, priceDay: 0 },
    { eventId: 2, category: 'Kabel', name: 'XLR-Kabel (verschiedene Längen)', qty: 12, needed: true, packed: false, note: '', source: 'catalog', isExternal: false, priceDay: 1 },
    { eventId: 2, category: 'Licht', name: 'Moving Head Spot (Miete)', qty: 4, needed: true, packed: false, note: 'Extern bestellen', source: 'catalog', isExternal: true, priceDay: 35 },
    { eventId: 2, category: 'Licht', name: 'Lichtständer / Traversen', qty: 4, needed: true, packed: false, note: '', source: 'catalog', isExternal: false, priceDay: 5 }
  ]);

  // ── Equipment Items (für Event 003 – Konzert Musikverein) ──
  await db.equipmentItems.bulkAdd([
    { eventId: 3, category: 'Mischpult', name: 'Allen & Heath SQ6 + Waves', qty: 1, needed: true, packed: false, note: '', source: 'catalog', isExternal: false, priceDay: 115 },
    { eventId: 3, category: 'Lautsprecher', name: 'LD Systems ICOA 12 Pro A (Top)', qty: 2, needed: true, packed: false, note: '', source: 'catalog', isExternal: false, priceDay: 24 },
    { eventId: 3, category: 'Lautsprecher', name: 'Lautsprecher-Ständer', qty: 2, needed: true, packed: false, note: '', source: 'catalog', isExternal: false, priceDay: 3.5 },
    { eventId: 3, category: 'Mikrofone', name: 'Shure SM58 (Kabel)', qty: 2, needed: true, packed: false, note: '', source: 'catalog', isExternal: false, priceDay: 3.5 },
    { eventId: 3, category: 'DI-Boxen', name: 'Passive DI-Boxen', qty: 4, needed: true, packed: false, note: '', source: 'catalog', isExternal: false, priceDay: 3 },
    { eventId: 3, category: 'Kabel', name: 'XLR-Kabel (verschiedene Längen)', qty: 10, needed: true, packed: false, note: '', source: 'catalog', isExternal: false, priceDay: 1 },
    { eventId: 3, category: 'Zubehör', name: 'Gaffa-Tape', qty: 2, needed: true, packed: false, note: '', source: 'catalog', isExternal: false, priceDay: 2 }
  ]);

  // ── Payments (für Event 001) ──
  await db.payments.bulkAdd([
    { eventId: 1, type: 'Anzahlung (30%)', dueDate: 'Bei Buchung', amount: 855.00, percent: 30, status: 'offen' },
    { eventId: 1, type: 'Zwischenzahlung (30%)', dueDate: '2 Wochen vor Event', amount: 855.00, percent: 30, status: 'offen' },
    { eventId: 1, type: 'Restzahlung (40%)', dueDate: 'Nach Event / am Tag', amount: 1140.00, percent: 40, status: 'offen' }
  ]);

  console.log('✅ Datenbank initialisiert mit Seed-Daten');
}
