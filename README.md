# TLS Event Manager 🎛️

**Professionelles Event-Planungstool für Veranstaltungstechniker**

Ein Offline-fähiges, client-seitiges Web-Tool zur Planung und Kalkulation von Veranstaltungsaufträgen — speziell entwickelt für Tontechniker, DJs und Kleingewerbe im Event-Bereich.

---

## 🚀 Quick Start

### Windows (einfachste Variante)

```batch
start.bat
```

Doppelklick startet automatisch einen lokalen Server und öffnet die App im Browser.

### Manuell (Linux / macOS / Windows)

```bash
cd TLS-EventPlanner
python3 -m http.server 8080
# Öffne http://localhost:8080 im Browser
```

Oder einfach die `index.html` doppelklicken (funktioniert, aber Datenbank-Features limitiert).

---

## ✨ Features

| Feature | Beschreibung |
|---------|-------------|
| **📊 Dashboard** | Auftrags-Pipeline (Kanban), Umsatz-Übersicht, kommende Events |
| **📅 Aufträge** | CRUD für Events mit Status-Tracking (Anfrage → Angebot → Bestätigt → Abgeschlossen) |
| **📍 Planung** | Multiple Locations, Tagesablauf-Zeitplan mit Checkboxen |
| **👥 Kontakte** | Ansprechpartner pro Event mit Telefon/E-Mail/Notizen |
| **🎛️ Equipment** | Checkliste mit "Benötigt?" + "Gepackt?", Fortschrittsbalken |
| **💰 Kalkulation** | Auto-Berechnung Equipment + Personal + MwSt. + Zahlungsplan |
| **📈 Marktpreise** | Preisvergleich TLS vs. Markt (Referenz) |
| **💾 Export/Import** | JSON-Backup aller Daten |
| **🔒 Offline** | Funktioniert ohne Internet (IndexedDB im Browser) |

---

## 🛠 Tech Stack

- **Vanilla JavaScript** — Keine Framework-Abhängigkeit, extrem langlebig
- **Dexie.js (IndexedDB)** — Client-side Datenbank, offline-fähig
- **Tailwind-inspiriertes CSS** — Custom Design System im TLS-Look (Dark Navy + Coral)
- **Lucide Icons** — Moderne, schlanke Icons
- **Kein Backend** — 100% client-side, keine Server-Kosten

---

## 📱 Screens / Navigation

| Screen | Route | Beschreibung |
|--------|-------|-------------|
| Dashboard | `#dashboard` | Pipeline + Statistiken |
| Aufträge | `#events` | Liste aller Events |
| Planung | `#planner/ID` | Locations + Tagesablauf |
| Kontakte | `#contacts/ID` | Ansprechpartner |
| Equipment | `#equipment/ID` | Checkliste |
| Kalkulation | `#calculation/ID` | Preise + Zahlungsplan |
| Marktpreise | `#market` | Referenzpreise |

---

## 🔄 Datenfluss

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Benutzer  │────▶│  UI (HTML/JS) │────▶│  IndexedDB  │
│  (Browser)  │◀────│  (Dexie.js)   │◀────│  (Client)   │
└─────────────┘     └──────────────┘     └─────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ JSON Export  │
                    │  (Backup)    │
                    └──────────────┘
```

---

## 📝 Hinweise

- **Erststart**: Datenbank wird automatisch mit Beispiel-Daten aus der Excel befüllt
- **Browser**: Funktioniert in Chrome, Firefox, Safari, Edge (moderne Browser)
- **Speicher**: Alle Daten bleiben im Browser gespeichert (IndexedDB)
- **Backup**: Regelmäßig JSON-Export über Sidebar-Button "Export" erstellen
- **Mobil**: Responsive Design, funktioniert auf Tablets und Smartphones

---

## 🎨 Design-System

- **Primärfarbe**: Coral `#e94560` (TLS Brand)
- **Hintergrund**: Dark Navy `#0f172a`
- **Karten**: Elevated `#1e293b`
- **Schrift**: Inter / System-Font
- **Status-Farben**: Blue (Anfrage) → Yellow (Angebot) → Green (Bestätigt) → Cyan (Bezahlt)

---

## 🔧 Anpassungen

Alle Daten, Styles und Logik sind in den Dateien unter `js/` und `css/`:

- `js/db.js` — Datenbank-Schema & Seed-Daten
- `js/app.js` — Haupt-App-Logik, Router, CRUD
- `js/components.js` — UI-Komponenten (Modal, Toast, Form-Builder)
- `css/app.css` — Design-System, Layout, Komponenten-Styling

Einfach editieren und Browser-Cache leeren (F5).

---

## 📦 Dateien

```
TLS-EventPlanner/
├── index.html          # Hauptdatei
├── css/
│   └── app.css         # Design System
├── js/
│   ├── db.js           # IndexedDB Schema + Seed
│   ├── components.js   # UI-Komponenten
│   └── app.js          # App-Logik
├── start.bat           # Windows Starter
└── README.md           # Diese Datei
```

---

## ⚠️ Bekannte Limitationen

- **Kein Multi-User**: Daten sind lokal im Browser (eine Person zur Zeit)
- **Kein Cloud-Sync**: Export/Import als Workaround
- **Kein PDF-Export** (geplant für v2)
- **Equipment-Katalog** ist statisch (kann über `js/db.js` erweitert werden)

---

## 🎯 Roadmap

- [ ] Drag & Drop in Kanban-Board
- [ ] PDF-Angebotsexport
- [ ] Kalender-Ansicht (Month/Week)
- [ ] Verfügbarkeitsprüfung (Equipment-Doppelbuchung)
- [ ] Dark/Light Mode Toggle
- [ ] PWA (Installierbar auf Home-Screen)

---

**Timon Live Sound — Professionelle Veranstaltungstechnik**
