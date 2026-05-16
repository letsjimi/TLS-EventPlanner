/**
 * Auto-Version-Check + Force-Reload bei neuem Code.
 * Kein STRG+F5 mehr nötig.
 */
(function() {
  const CHECK_EVERY = 10000;   // Sekunden (wie oft nach Updates suchen)
  const BOOT_DELAY  = 3000;    // Erst-Check nach Seitenladen (ServiceWorker brauch Sekunden)
  const STORAGE_KEY = '__tls_app_version__';

  let current = sessionStorage.getItem(STORAGE_KEY) || '';

  async function check() {
    try {
      // Cache-Bust: jede Anfrage ist einzigartig
      const url = './version.json?_cb=' + Date.now();
      const res = await fetch(url, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
      if (!res.ok) return;
      const data = await res.json();
      const remote = (data.version || '') + '|' + (data.build || '');

      if (!current) {
        // Erststart → speichern, nichts tun
        current = remote;
        sessionStorage.setItem(STORAGE_KEY, current);
        return;
      }

      if (remote !== current) {
        console.log('[VersionCheck] Neuer Code erkannt:', current, '→', remote);
        // Update-Marker setzen (verhindert endloses Reload bei fehlgeschlagenem Cache)
        sessionStorage.setItem('__tls_reload_pending__', '1');
        sessionStorage.setItem(STORAGE_KEY, remote);

        // Sofort navigieren mit Cache-Bust-Parameter (replace damit History bleibt)
        const u = new URL(window.location.href);
        u.searchParams.set('_v', remote.replace(/\|/g, '-'));
        window.location.replace(u.toString());
      }
    } catch (e) {
      // Offline oder Server down → ignorieren
    }
  }

  // Erst-Check nach Boot-Delay (damit SW sich registrieren kann)
  setTimeout(check, BOOT_DELAY);

  // Regelmäßiger Check
  setInterval(check, CHECK_EVERY);
})();
