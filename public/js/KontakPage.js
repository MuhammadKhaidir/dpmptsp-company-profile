/**
 * KontakPage
 * Halaman: Kontak
 *
 * File ini HANYA mengisi konten "kotak-kotak tengah" dari halaman Kontak
 * (header "Hubungi Kami", daftar info kontak, form "Kirim Pesan") ke
 * dalam:
 *
 *   <section id="kontak-section-placeholder" data-page="kontak">
 *
 * Navbar di luar section ini TIDAK disentuh sama sekali.
 *
 * Pasang bareng kontak.css (link di <head>), lalu panggil:
 *
 *   const kontakPage = new KontakPage();
 *   kontakPage.init();
 *
 * ...dan panggil kontakPage.destroy() saat pindah ke halaman lain, sesuai
 * pola page-lifecycle yang sudah dipakai di halaman lain.
 */

// Ikon di-inline sebagai SVG string (stroke pakai currentColor) supaya
// warnanya ikut warna teks/circle dari CSS, tanpa perlu file gambar
// terpisah.
const KONTAK_ICONS = {
  pin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.4"/></svg>`,
  phone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.3 1.2.4 2.5.6 3.8.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C11.6 21 3 12.4 3 2.9c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.6.6 3.8.1.4 0 .8-.3 1.1L6.6 10.8Z"/></svg>`,
  mail: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.2"/><path d="m4 7 7.4 5.6a1 1 0 0 0 1.2 0L20 7"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.6"/><path d="M12 7.5V12l3 2"/></svg>`,
  user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8.2" r="3.4"/><path d="M4.8 20c.9-3.6 3.9-5.8 7.2-5.8s6.3 2.2 7.2 5.8"/></svg>`,
  document: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3.5h7.2L19 8.3V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 7 19V3.5Z"/><path d="M14 3.5V8h4.7"/><path d="M9.5 13h5M9.5 16.3h5"/></svg>`,
  chevronDown: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
  chat: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 1 3.3 6.5L4 20l1.3-3.6A7.96 7.96 0 0 1 4 12Z"/></svg>`,
  send: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 3 3 10.5l7 2.7L15 21l6-18Z"/><path d="m10.5 13.2 4-5"/></svg>`
};

// Isi daftar info kontak. Tinggal edit array ini kalau alamat/telepon/dll
// berubah -- tidak perlu sentuh markup di bawah.
const KONTAK_INFO_ITEMS = [
  {
    icon: 'pin',
    title: 'Alamat',
    lines: ['Jl. Merdeka No. 123, Ilir Timur I', 'Palembang, Sumatera Selatan 30111']
  },
  {
    icon: 'phone',
    title: 'Telepon',
    lines: ['(0711) 123456']
  },
  {
    icon: 'mail',
    title: 'Email',
    lines: ['dpmptsp@palembang.go.id']
  },
  {
    icon: 'clock',
    title: 'Jam Pelayanan',
    lines: ['Senin – Jumat  |  08.00 – 16.00 WIB']
  }
];

const KONTAK_KATEGORI_OPTIONS = [
  { value: 'pertanyaan', label: 'Pertanyaan' },
  { value: 'saran', label: 'Saran' },
  { value: 'kritik', label: 'Kritik' },
  { value: 'pengaduan', label: 'Pengaduan' },
  { value: 'lainnya', label: 'Lainnya' }
];

class KontakPage {
  constructor() {
    this.pageName = 'Kontak';
    this.section = null;
    this.form = null;
    this.feedbackEl = null;
    this.submitBtn = null;

    this.handleSubmit = this.handleSubmit.bind(this);
  }

  init() {
    this.section = document.getElementById('kontak-section-placeholder');
    if (!this.section) {
      console.warn('[' + this.pageName + '] #kontak-section-placeholder tidak ditemukan di DOM');
      return;
    }
    this.render();
    console.log('[' + this.pageName + '] initialized');
  }

  render() {
    if (!this.section) return;

    this.section.classList.add('kontak-section');
    this.section.innerHTML = this.buildMarkup();

    this.form = this.section.querySelector('#kontakForm');
    this.feedbackEl = this.section.querySelector('#kontakFormFeedback');
    this.submitBtn = this.section.querySelector('.kontak-submit-btn');

    if (this.form) {
      this.form.addEventListener('submit', this.handleSubmit);
    }
  }

  buildMarkup() {
    return `
      <div class="kontak-head" data-fade-target>
        <p class="kontak-eyebrow">
          <span class="kontak-eyebrow-arrow" aria-hidden="true">&rarr;</span>
          KONTAK
          <span class="kontak-eyebrow-arrow" aria-hidden="true">&larr;</span>
        </p>
        <h2 class="kontak-title">Hubungi Kami</h2>
        <p class="kontak-subtitle">
          Kami siap membantu Anda. Silakan hubungi kami melalui
          informasi berikut atau kirim pesan melalui form yang tersedia.
        </p>
      </div>

      <div class="kontak-grid">
        <div class="kontak-info-list" data-fade-target>
          ${this.buildInfoItemsMarkup()}
        </div>

        <div class="kontak-form-card" data-fade-target>
          <h3 class="kontak-form-title">Kirim Pesan</h3>
          <p class="kontak-form-desc">
            Kritik, saran, atau pertanyaan? Silakan isi form di bawah ini.
            Kami akan segera merespons pesan Anda.
          </p>

          <form class="kontak-form" id="kontakForm" novalidate>
            <div class="kontak-form-row">
              <label class="kontak-field">
                <span class="kontak-field-icon">${KONTAK_ICONS.user}</span>
                <input type="text" name="nama" placeholder="Nama Lengkap" autocomplete="name" required>
              </label>
              <label class="kontak-field">
                <span class="kontak-field-icon">${KONTAK_ICONS.mail}</span>
                <input type="email" name="email" placeholder="Email" autocomplete="email" required>
              </label>
            </div>

            <label class="kontak-field kontak-field-full">
              <span class="kontak-field-icon">${KONTAK_ICONS.phone}</span>
              <input type="tel" name="telepon" placeholder="Nomor Telepon" autocomplete="tel">
            </label>

            <label class="kontak-field kontak-field-full kontak-field-select">
              <span class="kontak-field-icon">${KONTAK_ICONS.document}</span>
              <select name="kategori" required>
                <option value="" disabled selected hidden>Kategori Pesan</option>
                ${this.buildKategoriOptionsMarkup()}
              </select>
              <span class="kontak-field-chevron" aria-hidden="true">${KONTAK_ICONS.chevronDown}</span>
            </label>

            <label class="kontak-field kontak-field-full kontak-field-textarea">
              <span class="kontak-field-icon">${KONTAK_ICONS.chat}</span>
              <textarea name="pesan" placeholder="Pesan Anda..." rows="4" required></textarea>
            </label>

            <p class="kontak-form-feedback" id="kontakFormFeedback" role="status" aria-live="polite"></p>

            <button type="submit" class="kontak-submit-btn">
              <span class="kontak-submit-icon" aria-hidden="true">${KONTAK_ICONS.send}</span>
              Kirim Pesan
            </button>
          </form>
        </div>
      </div>
    `;
  }

  buildInfoItemsMarkup() {
    return KONTAK_INFO_ITEMS.map((item, i) => {
      const isLast = i === KONTAK_INFO_ITEMS.length - 1;
      const divider = isLast ? '' : '<div class="kontak-info-divider"></div>';
      const lines = item.lines.map((line) => this.escapeHtml(line)).join('<br>');
      return `
        <div class="kontak-info-item">
          <div class="kontak-info-icon">${KONTAK_ICONS[item.icon]}</div>
          <div class="kontak-info-text">
            <h3>${this.escapeHtml(item.title)}</h3>
            <p>${lines}</p>
          </div>
        </div>
        ${divider}
      `;
    }).join('');
  }

  buildKategoriOptionsMarkup() {
    return KONTAK_KATEGORI_OPTIONS.map(
      (opt) => `<option value="${opt.value}">${this.escapeHtml(opt.label)}</option>`
    ).join('');
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  handleSubmit(e) {
    e.preventDefault();
    if (!this.form) return;

    if (!this.form.checkValidity()) {
      this.form.reportValidity();
      return;
    }

    const formData = new FormData(this.form);
    const payload = Object.fromEntries(formData.entries());

    // TODO: sambungkan ke endpoint backend beneran, contoh pola yang
    // sudah dipakai di fitur lain (lihat FLIPBOOK_API di FlipBookScroll.js):
    //
    //   fetch('/api/kontak/send', {
    //     method: 'POST',
    //     headers: { 'Content-Type': 'application/json' },
    //     body: JSON.stringify(payload),
    //     credentials: 'same-origin'
    //   })
    //     .then((res) => res.json())
    //     .then((data) => {
    //       if (!data.success) { this.showFeedback('error', data.message || 'Gagal mengirim pesan.'); return; }
    //       this.showFeedback('success', 'Terima kasih! Pesan Anda sudah terkirim.');
    //       this.form.reset();
    //     })
    //     .catch(() => this.showFeedback('error', 'Gagal terhubung ke server. Coba lagi.'));
    //
    // Untuk sementara (belum ada endpoint), form cuma divalidasi di
    // browser lalu tampilkan pesan sukses di bawah ini:
    console.log('[' + this.pageName + '] submit pesan:', payload);
    this.showFeedback('success', 'Terima kasih! Pesan Anda sudah terkirim, kami akan segera merespons.');
    this.form.reset();
  }

  showFeedback(type, message) {
    if (!this.feedbackEl) return;
    this.feedbackEl.textContent = message;
    this.feedbackEl.classList.remove('success', 'error');
    this.feedbackEl.classList.add(type, 'is-visible');
  }

  destroy() {
    if (this.form) {
      this.form.removeEventListener('submit', this.handleSubmit);
    }
    if (this.section) {
      this.section.innerHTML = '';
      this.section.classList.remove('kontak-section');
    }
    this.form = null;
    this.feedbackEl = null;
    this.submitBtn = null;
    console.log('[' + this.pageName + '] destroyed');
  }
}


document.addEventListener('DOMContentLoaded', function () {
  const kontakPage = new KontakPage();
  kontakPage.init();
});