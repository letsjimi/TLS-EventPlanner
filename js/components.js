/**
 * TLS Event Manager — UI Components
 * Wiederverwendbare Komponenten: Modal, Toast, Forms
 */

const UI = {
  // ── Toast Benachrichtigungen ──
  toast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = type === 'success' ? 'check-circle' : type === 'error' ? 'x-circle' : 'info';
    toast.innerHTML = `
      <i data-lucide="${icon}" style="width:18px;height:18px;flex-shrink:0;color:var(--c-${type === 'info' ? 'accent' : type})"></i>
      <span>${message}</span>
    `;
    container.appendChild(toast);
    lucide.createIcons({ nodes: [toast] });
    setTimeout(() => {
      toast.style.animation = 'toastIn 300ms ease reverse';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  // ── Modal ──
  openModal(title, contentHTML, onConfirm = null, confirmText = 'Speichern') {
    const overlay = document.getElementById('modal-overlay');
    let modal = document.querySelector('.modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.className = 'modal';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="modal-header">
        <h3 class="modal-title">${title}</h3>
        <button class="modal-close" onclick="UI.closeModal()">
          <i data-lucide="x" style="width:20px;height:20px"></i>
        </button>
      </div>
      <div class="modal-body">${contentHTML}</div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="UI.closeModal()">Abbrechen</button>
        ${onConfirm ? `<button class="btn btn-primary" id="modal-confirm">${confirmText}</button>` : ''}
      </div>
    `;

    overlay.classList.add('active');
    modal.classList.add('active');
    lucide.createIcons({ nodes: [modal] });

    if (onConfirm) {
      document.getElementById('modal-confirm').onclick = () => {
        onConfirm();
        UI.closeModal();
      };
    }
  },

  closeModal() {
    document.getElementById('modal-overlay').classList.remove('active');
    const modal = document.querySelector('.modal');
    if (modal) modal.classList.remove('active');
  },

  // ── Confirm Dialog ──
  confirm(message, onConfirm) {
    this.openModal('Bestätigen',
      `<p style="color:var(--c-text-2)">${message}</p>`,
      onConfirm, 'Ja, fortfahren'
    );
  },

  // ── Form Builder ──
  form(fields, values = {}) {
    return fields.map(f => {
      const val = values[f.name] || '';
      if (f.type === 'textarea') {
        return `
          <div class="form-group">
            <label class="form-label">${f.label}</label>
            <textarea class="form-textarea" name="${f.name}" placeholder="${f.placeholder || ''}" rows="${f.rows || 3}">${val}</textarea>
          </div>`;
      }
      if (f.type === 'select') {
        return `
          <div class="form-group">
            <label class="form-label">${f.label}</label>
            <select class="form-select" name="${f.name}">
              ${f.options.map(o => `<option value="${o.value}" ${val === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
            </select>
          </div>`;
      }
      if (f.type === 'checkbox') {
        return `
          <div class="form-group">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
              <input type="checkbox" name="${f.name}" ${val ? 'checked' : ''} style="width:18px;height:18px">
              <span>${f.label}</span>
            </label>
          </div>`;
      }
      return `
        <div class="form-group">
          <label class="form-label">${f.label}</label>
          <input type="${f.type || 'text'}" class="form-input" name="${f.name}" value="${val}" placeholder="${f.placeholder || ''}" ${f.step ? `step="${f.step}"` : ''}>
        </div>`;
    }).join('');
  },

  // ── Get Form Values ──
  getFormData(formElement) {
    const data = {};
    formElement.querySelectorAll('input, select, textarea').forEach(el => {
      if (el.type === 'checkbox') {
        data[el.name] = el.checked;
      } else if (el.type === 'number') {
        data[el.name] = parseFloat(el.value) || 0;
      } else {
        data[el.name] = el.value;
      }
    });
    return data;
  },

  // ── Status Badge HTML ──
  statusBadge(status) {
    const map = {
      inquiry:   { cls: 'badge-inquiry',   label: 'Anfrage' },
      offer:     { cls: 'badge-offer',     label: 'Angebot' },
      inspected: { cls: 'badge-inspected', label: 'Besichtigt' },
      confirmed: { cls: 'badge-confirmed', label: 'Bestätigt' },
      paid:      { cls: 'badge-paid',      label: 'Bezahlt' },
      done:      { cls: 'badge-done',      label: 'Abgeschlossen' },
      cancelled: { cls: 'badge-cancelled', label: 'Storniert' }
    };
    const s = map[status] || map.inquiry;
    return `<span class="badge ${s.cls}">${s.label}</span>`;
  },

  // ── Format Currency ──
  euro(n) {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
  },

  // ── Format Date ──
  formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  },

  // ── Format Date Relative ──
  relativeDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    const now = new Date();
    const diff = Math.ceil((d - now) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'Heute';
    if (diff === 1) return 'Morgen';
    if (diff < 0) return `Vor ${Math.abs(diff)} Tagen`;
    if (diff < 30) return `In ${diff} Tagen`;
    return this.formatDate(dateStr);
  },

  // ── Empty State ──
  emptyState(icon, title, subtitle) {
    return `
      <div style="text-align:center;padding:var(--space-2xl);color:var(--c-text-3)">
        <i data-lucide="${icon}" style="width:48px;height:48px;margin-bottom:var(--space-md);opacity:0.5"></i>
        <h3 style="color:var(--c-text);margin-bottom:var(--space-sm)">${title}</h3>
        <p>${subtitle}</p>
      </div>`;
  }
};
