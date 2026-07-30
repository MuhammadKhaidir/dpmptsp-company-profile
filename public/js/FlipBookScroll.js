// js/FlipBookEditor.js
//
// Panel EDIT KONTEN FLIPBOOK: tombol melayang -> gerbang password -> panel
// form (tambah/hapus/urutkan halaman, ubah teks, ganti gambar per
// halaman/sampul). File BARU, berdiri sendiri -- TIDAK menyentuh isi
// js/FlipBookScroll.js selain lewat API publik yang sudah ada
// (window.__flipBookScrollInstance, window.FlipBookDefaultBooks).
//
// Alur simpan: perubahan TEKS & GAMBAR yang menyentuh halaman/sampul yang
// SUDAH ADA dicoba ditampilkan langsung di buku asli (live preview) lewat
// window.__flipBookScrollInstance. Begitu ada perubahan STRUKTUR (tambah
// halaman, hapus halaman, urutkan ulang, tambah buku, hapus buku), live
// preview otomatis dimatikan untuk buku terkait -- mesin flip 3D
// membangun DOM tiap halaman sekali di awal, jadi perubahan struktur
// paling aman ditampilkan dengan cara reload halaman setelah "Simpan"
// berhasil, bukan dipaksa nge-patch DOM yang berisiko keliru.

(function () {
  'use strict';

  const API_BASE = '/api/flipbook';
  const MAX_FILE_SIZE = 4 * 1024 * 1024;
  const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function padPage(n) { return String(n).padStart(2, '0'); }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function freshPage() {
    return { page: '01', heading: 'Judul Halaman', body: 'Tulis isi halaman di sini.', image: null };
  }

  function freshBook() {
    return {
      title: 'Buku Baru',
      cover: { kicker: 'DPMPTSP KOTA PALEMBANG', heading: 'Judul Buku Baru', image: null },
      content: [freshPage()],
      backCover: { heading: 'Judul', tagline: 'Tagline singkat', image: null }
    };
  }

  function renumber(book) {
    book.content.forEach((p, i) => { p.page = padPage(i + 1); });
  }

  function normalizeBook(book) {
    book = book || {};
    book.title = book.title || '';
    book.cover = book.cover || {};
    book.backCover = book.backCover || {};
    book.content = Array.isArray(book.content) && book.content.length ? book.content : [freshPage()];
    return book;
  }

  /* ------------------------------------------------------------------ */
  /* State                                                               */
  /* ------------------------------------------------------------------ */
  const state = {
    password: null,
    books: [],
    dirtyStructure: {}, // { [bookIndex]: true } -> live preview dimatikan buat buku ini
    hasUnsaved: false
  };

  /* ------------------------------------------------------------------ */
  /* Panggilan API                                                       */
  /* ------------------------------------------------------------------ */
  async function apiVerify(password) {
    const res = await fetch(`${API_BASE}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && !!data.success, message: data.message || null };
  }

  async function apiGetData() {
    try {
      const res = await fetch(`${API_BASE}/data`);
      if (!res.ok) return null;
      const data = await res.json().catch(() => null);
      if (data && data.success && Array.isArray(data.books) && data.books.length) {
        return data.books;
      }
    } catch (err) {
      console.warn('[FlipBookEditor] Gagal ambil data:', err);
    }
    return null;
  }

  async function apiSaveData(books, password) {
    const res = await fetch(`${API_BASE}/data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, books })
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && !!data.success, message: data.message || null };
  }

  async function apiUploadImage(file, password, prevPathname) {
    const form = new FormData();
    form.append('image', file);
    form.append('password', password);
    if (prevPathname) form.append('prevPathname', prevPathname);
    const res = await fetch(`${API_BASE}/image`, { method: 'POST', body: form });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && !!data.success, image: data.image || null, message: data.message || null };
  }

  async function apiDeleteImage(pathname, password) {
    const res = await fetch(`${API_BASE}/image/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, pathname })
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && !!data.success, message: data.message || null };
  }

  /* ------------------------------------------------------------------ */
  /* Live-preview: coba tampilkan perubahan langsung di buku 3D asli      */
  /* ------------------------------------------------------------------ */
  function getInstance() {
    return window.__flipBookScrollInstance || null;
  }

  function liveFlipBook(bookIndex) {
    const inst = getInstance();
    if (!inst || state.dirtyStructure[bookIndex]) return null;
    return inst.flipBooks[bookIndex] || null;
  }

  function liveCoverFace(bookIndex) {
    const fb = liveFlipBook(bookIndex);
    if (!fb || !fb.pageEls[0]) return null;
    return fb.pageEls[0].page.querySelector('.fb-face-cover');
  }

  function liveBackFace(bookIndex) {
    const fb = liveFlipBook(bookIndex);
    if (!fb || !fb.pageEls.length) return null;
    const last = fb.pageEls[fb.pageEls.length - 1];
    return last.page.querySelector('.fb-face-back');
  }

  function livePageEntry(bookIndex, pageIndex) {
    const fb = liveFlipBook(bookIndex);
    if (!fb) return null;
    // leaf 0 = sampul depan, leaf 1..N = halaman isi ke-0..N-1
    return fb.pageEls[pageIndex + 1] || null;
  }

  function livePatchTitle(bookIndex, value) {
    const inst = getInstance();
    if (!inst || state.dirtyStructure[bookIndex]) return;
    if (inst.activeIndex === bookIndex) inst.caption.textContent = value;
  }

  function livePatchCoverText(bookIndex, field, value) {
    const face = liveCoverFace(bookIndex);
    if (!face) return;
    const node = face.querySelector(field === 'kicker' ? '.fb-kicker' : '.fb-cover-heading');
    if (node) node.textContent = value;
  }

  function livePatchBackText(bookIndex, field, value) {
    const face = liveBackFace(bookIndex);
    if (!face) return;
    const node = face.querySelector(field === 'heading' ? '.fb-back-heading' : '.fb-back-tagline');
    if (node) node.textContent = value;
  }

  function livePatchPageText(bookIndex, pageIndex, field, value, page) {
    const entry = livePageEntry(bookIndex, pageIndex);
    if (!entry || !entry.frontReveal) return;
    const node = entry.frontReveal.querySelector(field === 'heading' ? '.fb-page-heading' : '.fb-page-body');
    if (node) node.textContent = value;

    // Kalau halaman ini lagi tampil sebagai "gambar penuh" (imageonly) dan
    // sekarang mulai diisi teks (atau sebaliknya jadi kosong lagi), kelas
    // imageonly perlu disesuaikan biar layout ikut berubah.
    const face = entry.page.querySelector('.fb-face-text');
    const hasImg = !!entry.frontReveal.querySelector('.fb-page-image');
    if (face && hasImg && page) {
      const hasText = !!(page.heading || page.body);
      face.classList.toggle('fb-face-text-imageonly', !hasText);
    }
  }

  function applyFaceImage(face, url) {
    if (!face) return;
    if (url) {
      face.classList.add('fb-face-has-image');
      face.style.backgroundImage =
        `url("${url}"), linear-gradient(120deg, transparent 30%, rgba(255, 255, 255, 0.06) 45%, transparent 60%), radial-gradient(120% 140% at 30% 0%, #1c1c1f 0%, #0b0b0d 55%, #060607 100%)`;
    } else {
      face.classList.remove('fb-face-has-image');
      face.style.backgroundImage = '';
    }
  }

  function livePatchCoverImage(bookIndex, url) { applyFaceImage(liveCoverFace(bookIndex), url); }
  function livePatchBackImage(bookIndex, url) { applyFaceImage(liveBackFace(bookIndex), url); }

  function livePatchPageImage(bookIndex, pageIndex, url, altText) {
    const entry = livePageEntry(bookIndex, pageIndex);
    if (!entry || !entry.frontReveal) return;
    let img = entry.frontReveal.querySelector('.fb-page-image');
    const face = entry.page.querySelector('.fb-face-text');

    if (url) {
      if (!img) {
        img = document.createElement('img');
        img.className = 'fb-page-image';
        entry.frontReveal.insertBefore(img, entry.frontReveal.firstChild);
      }
      img.src = url;
      img.alt = altText || '';
      const headingNode = entry.frontReveal.querySelector('.fb-page-heading');
      const bodyNode = entry.frontReveal.querySelector('.fb-page-body');
      const hasText = !!((headingNode && headingNode.textContent) || (bodyNode && bodyNode.textContent));
      if (face) face.classList.toggle('fb-face-text-imageonly', !hasText);
    } else if (img) {
      img.remove();
      if (face) face.classList.remove('fb-face-text-imageonly');
    }
  }

  function liveGoTo(bookIndex, pageNumber) {
    const inst = getInstance();
    if (inst && typeof inst.goToBook === 'function') inst.goToBook(bookIndex, pageNumber == null ? null : pageNumber);
  }

  function markStructureDirty(bookIndex) {
    state.dirtyStructure[bookIndex] = true;
  }

  /* ------------------------------------------------------------------ */
  /* UI: tombol melayang                                                 */
  /* ------------------------------------------------------------------ */
  function buildTrigger() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fbe-trigger';
    btn.title = 'Edit Konten Flipbook';
    btn.setAttribute('aria-label', 'Edit Konten Flipbook');
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M12 20h9"></path>' +
      '<path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>' +
      '</svg>';
    btn.addEventListener('click', () => {
      if (state.password) openEditorPanel();
      else openPasswordModal();
    });
    document.body.appendChild(btn);
  }

  /* ------------------------------------------------------------------ */
  /* UI: modal password                                                  */
  /* ------------------------------------------------------------------ */
  function openPasswordModal() {
    const overlay = document.createElement('div');
    overlay.className = 'fbe-overlay';
    overlay.innerHTML = `
      <div class="fbe-auth-card">
        <h3>Masuk Mode Edit</h3>
        <p>Masukkan kata sandi editor untuk mengubah konten flipbook.</p>
        <input type="password" class="fbe-auth-input" placeholder="Kata sandi" autocomplete="off">
        <div class="fbe-auth-error"></div>
        <div class="fbe-auth-actions">
          <button type="button" class="fbe-btn fbe-btn-ghost fbe-auth-cancel">Batal</button>
          <button type="button" class="fbe-btn fbe-btn-primary fbe-auth-submit">Masuk</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('.fbe-auth-input');
    const errorEl = overlay.querySelector('.fbe-auth-error');
    const submitBtn = overlay.querySelector('.fbe-auth-submit');
    const cancelBtn = overlay.querySelector('.fbe-auth-cancel');

    function close() {
      document.removeEventListener('keydown', onKeydown);
      overlay.remove();
    }
    function onKeydown(e) {
      if (e.key === 'Escape') close();
      if (e.key === 'Enter') submit();
    }

    async function submit() {
      const val = input.value;
      if (!val) { errorEl.textContent = 'Kata sandi belum diisi.'; return; }
      submitBtn.disabled = true;
      submitBtn.textContent = 'Memeriksa...';
      errorEl.textContent = '';
      try {
        const result = await apiVerify(val);
        if (result.ok) {
          state.password = val;
          close();
          openEditorPanel();
        } else {
          errorEl.textContent = result.message || 'Kata sandi salah.';
        }
      } catch (err) {
        errorEl.textContent = 'Gagal menghubungi server. Coba lagi.';
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Masuk';
      }
    }

    cancelBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    submitBtn.addEventListener('click', submit);
    document.addEventListener('keydown', onKeydown);
    input.focus();
  }

  /* ------------------------------------------------------------------ */
  /* UI: panel editor utama                                              */
  /* ------------------------------------------------------------------ */
  let panelOverlay = null;

  function setStatus(msg, kind) {
    if (!panelOverlay) return;
    const statusEl = panelOverlay.querySelector('.fbe-status');
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.classList.remove('is-error', 'is-success');
    if (kind) statusEl.classList.add(kind === 'error' ? 'is-error' : 'is-success');
  }

  function onPanelKeydown(e) {
    if (e.key === 'Escape') closeEditorPanel();
  }

  async function openEditorPanel() {
    if (panelOverlay) return;

    panelOverlay = document.createElement('div');
    panelOverlay.className = 'fbe-overlay';
    panelOverlay.innerHTML = `
      <div class="fbe-panel">
        <div class="fbe-panel-header">
          <h2>Edit Konten Flipbook</h2>
          <button type="button" class="fbe-close" aria-label="Tutup">&times;</button>
        </div>
        <div class="fbe-panel-body"><div class="fbe-loading">Memuat data...</div></div>
        <div class="fbe-panel-footer">
          <span class="fbe-status"></span>
          <div class="fbe-footer-actions">
            <button type="button" class="fbe-btn fbe-btn-ghost fbe-cancel">Tutup</button>
            <button type="button" class="fbe-btn fbe-btn-primary fbe-save" disabled>Simpan Semua Perubahan</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(panelOverlay);

    panelOverlay.querySelector('.fbe-close').addEventListener('click', closeEditorPanel);
    panelOverlay.querySelector('.fbe-cancel').addEventListener('click', closeEditorPanel);
    panelOverlay.querySelector('.fbe-save').addEventListener('click', handleSaveClick);
    panelOverlay.addEventListener('click', (e) => { if (e.target === panelOverlay) closeEditorPanel(); });
    document.addEventListener('keydown', onPanelKeydown);

    const bodyEl = panelOverlay.querySelector('.fbe-panel-body');
    bodyEl.addEventListener('input', handleFieldInput);
    bodyEl.addEventListener('click', handleBodyClick);
    bodyEl.addEventListener('change', handleFileChange);

    state.dirtyStructure = {};
    state.hasUnsaved = false;

    const saved = await apiGetData();
    const seed = saved || window.FlipBookDefaultBooks || [];
    state.books = clone(seed).map(normalizeBook);
    state.books.forEach(renumber);

    renderBody();
    const saveBtn = panelOverlay.querySelector('.fbe-save');
    if (saveBtn) saveBtn.disabled = false;
  }

  function closeEditorPanel() {
    if (!panelOverlay) return;
    if (state.hasUnsaved) {
      const ok = window.confirm('Ada perubahan yang belum disimpan. Tetap tutup tanpa menyimpan?');
      if (!ok) return;
    }
    document.removeEventListener('keydown', onPanelKeydown);
    panelOverlay.remove();
    panelOverlay = null;
  }

  function addBookButtonHtml() {
    return '<button type="button" class="fbe-btn fbe-btn-add fbe-add-book">+ Tambah Buku Baru</button>';
  }

  function imageControlHtml(bookIndex, slot, pageIndex, image) {
    const hasImage = !!(image && image.url);
    const pageAttr = pageIndex != null ? ` data-page="${pageIndex}"` : '';
    const dataAttrs = `data-book="${bookIndex}" data-slot="${slot}"${pageAttr}`;
    return `
      <div class="fbe-image-control" ${dataAttrs}>
        <div class="fbe-image-preview">
          ${hasImage ? `<img src="${escapeHtml(image.url)}" alt="">` : '<span>Belum ada gambar</span>'}
        </div>
        <div class="fbe-image-actions">
          <label class="fbe-btn fbe-btn-ghost fbe-file-btn">
            <span class="fbe-file-btn-label">${hasImage ? 'Ganti Gambar' : 'Unggah Gambar'}</span>
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" ${dataAttrs}>
          </label>
          ${hasImage ? `<button type="button" class="fbe-btn fbe-btn-ghost fbe-remove-image" ${dataAttrs}>Hapus Gambar</button>` : ''}
          <span class="fbe-image-status"></span>
        </div>
      </div>
    `;
  }

  function renderPageHtml(book, bi, page, pi) {
    return `
      <div class="fbe-page-card" data-book="${bi}" data-page="${pi}">
        <div class="fbe-page-card-head">
          <span>Halaman ${page.page || padPage(pi + 1)}</span>
          <div class="fbe-page-card-actions">
            <button type="button" class="fbe-icon-btn" data-action="move-up" data-book="${bi}" data-page="${pi}" title="Naikkan"${pi === 0 ? ' disabled' : ''}>&uarr;</button>
            <button type="button" class="fbe-icon-btn" data-action="move-down" data-book="${bi}" data-page="${pi}" title="Turunkan"${pi === book.content.length - 1 ? ' disabled' : ''}>&darr;</button>
            <button type="button" class="fbe-icon-btn" data-action="preview-page" data-book="${bi}" data-page="${pi}" title="Lihat di buku">&#128065;</button>
            <button type="button" class="fbe-icon-btn fbe-icon-btn-danger" data-action="delete-page" data-book="${bi}" data-page="${pi}" title="Hapus halaman">&times;</button>
          </div>
        </div>
        <label class="fbe-field">Judul Halaman
          <input type="text" data-book="${bi}" data-slot="content" data-page="${pi}" data-field="heading" value="${escapeHtml(page.heading)}">
        </label>
        <label class="fbe-field">Isi
          <textarea data-book="${bi}" data-slot="content" data-page="${pi}" data-field="body" rows="3">${escapeHtml(page.body)}</textarea>
        </label>
        ${imageControlHtml(bi, 'content', pi, page.image)}
      </div>
    `;
  }

  function renderBookHtml(book, bi) {
    const cover = book.cover;
    const back = book.backCover;
    const dirty = !!state.dirtyStructure[bi];
    return `
      <details class="fbe-book" open data-book="${bi}">
        <summary>
          <span class="fbe-book-title-preview">${escapeHtml(book.title || `Buku ${bi + 1}`)}</span>
          <button type="button" class="fbe-btn fbe-btn-danger fbe-remove-book" data-book="${bi}">Hapus Buku</button>
        </summary>
        <div class="fbe-book-body">
          ${dirty ? '<div class="fbe-structure-note">Pratinjau langsung di buku nonaktif sementara untuk buku ini (strukturnya baru saja diubah). Klik &quot;Simpan Semua Perubahan&quot; untuk melihat hasil akhirnya di buku.</div>' : ''}
          <label class="fbe-field">Judul Buku (label yang tampil di sisi layar)
            <input type="text" data-book="${bi}" data-slot="title" value="${escapeHtml(book.title)}">
          </label>

          <fieldset class="fbe-fieldset">
            <legend>Sampul Depan</legend>
            <label class="fbe-field">Label Kecil
              <input type="text" data-book="${bi}" data-slot="cover" data-field="kicker" value="${escapeHtml(cover.kicker)}">
            </label>
            <label class="fbe-field">Judul Sampul
              <input type="text" data-book="${bi}" data-slot="cover" data-field="heading" value="${escapeHtml(cover.heading)}">
            </label>
            ${imageControlHtml(bi, 'cover', null, cover.image)}
            <div class="fbe-row-actions">
              <button type="button" class="fbe-btn fbe-btn-ghost fbe-preview-btn" data-book="${bi}">Lihat Sampul di Buku</button>
            </div>
          </fieldset>

          <fieldset class="fbe-fieldset">
            <legend>Halaman Isi (${book.content.length})</legend>
            <div class="fbe-pages-list">
              ${book.content.map((p, pi) => renderPageHtml(book, bi, p, pi)).join('')}
            </div>
            <button type="button" class="fbe-btn fbe-btn-add fbe-add-page" data-book="${bi}">+ Tambah Halaman</button>
          </fieldset>

          <fieldset class="fbe-fieldset">
            <legend>Sampul Belakang</legend>
            <label class="fbe-field">Judul
              <input type="text" data-book="${bi}" data-slot="backCover" data-field="heading" value="${escapeHtml(back.heading)}">
            </label>
            <label class="fbe-field">Tagline
              <input type="text" data-book="${bi}" data-slot="backCover" data-field="tagline" value="${escapeHtml(back.tagline)}">
            </label>
            ${imageControlHtml(bi, 'backCover', null, back.image)}
          </fieldset>
        </div>
      </details>
    `;
  }

  function renderBody() {
    if (!panelOverlay) return;
    const bodyEl = panelOverlay.querySelector('.fbe-panel-body');
    if (!state.books.length) {
      bodyEl.innerHTML = '<div class="fbe-empty-note">Belum ada buku. Klik tombol di bawah untuk menambah buku pertama.</div>' + addBookButtonHtml();
      return;
    }
    bodyEl.innerHTML = state.books.map((book, bi) => renderBookHtml(book, bi)).join('') + addBookButtonHtml();
  }

  function getBookPage(bookIndex, slot, pageIndex) {
    const book = state.books[bookIndex];
    if (!book) return null;
    if (slot === 'cover') return book.cover;
    if (slot === 'backCover') return book.backCover;
    if (slot === 'content') return book.content[pageIndex];
    return null;
  }

  function readPageIndex(dataset) {
    return dataset.page !== undefined && dataset.page !== '' ? Number(dataset.page) : null;
  }

  /* ---- input teks (judul buku, kicker, heading, body, tagline, dst) ---- */
  function handleFieldInput(e) {
    const target = e.target;
    const isTextInput = target.matches && (target.matches('input[type="text"]') || target.matches('textarea'));
    if (!isTextInput) return;

    state.hasUnsaved = true;

    const bi = Number(target.dataset.book);
    const slot = target.dataset.slot;
    const field = target.dataset.field;
    const pageIndex = readPageIndex(target.dataset);
    const value = target.value;

    const book = state.books[bi];
    if (!book) return;

    if (slot === 'title') {
      book.title = value;
      const preview = panelOverlay.querySelector(`.fbe-book[data-book="${bi}"] .fbe-book-title-preview`);
      if (preview) preview.textContent = value || `Buku ${bi + 1}`;
      livePatchTitle(bi, value);
      return;
    }

    if (slot === 'cover') {
      book.cover[field] = value;
      livePatchCoverText(bi, field, value);
      return;
    }

    if (slot === 'backCover') {
      book.backCover[field] = value;
      livePatchBackText(bi, field, value);
      return;
    }

    if (slot === 'content' && pageIndex != null) {
      const page = book.content[pageIndex];
      if (!page) return;
      page[field] = value;
      livePatchPageText(bi, pageIndex, field, value, page);
    }
  }

  /* ---- klik: tambah/hapus buku, tambah/hapus/urutkan halaman, preview, hapus gambar ---- */
  function handleBodyClick(e) {
    const addBookBtn = e.target.closest('.fbe-add-book');
    if (addBookBtn) {
      state.books.push(freshBook());
      markStructureDirty(state.books.length - 1);
      state.hasUnsaved = true;
      renderBody();
      setStatus('Buku baru ditambahkan. Jangan lupa klik "Simpan Semua Perubahan".');
      return;
    }

    const removeBookBtn = e.target.closest('.fbe-remove-book');
    if (removeBookBtn) {
      const bi = Number(removeBookBtn.dataset.book);
      const book = state.books[bi];
      const ok = window.confirm(`Hapus buku "${book && book.title ? book.title : 'ini'}" beserta seluruh halamannya?`);
      if (!ok) return;
      state.books.splice(bi, 1);
      // Indeks buku setelah yang dihapus jadi geser -- matikan live
      // preview buat semua buku dari titik ini biar gak salah nge-patch
      // buku yang keliru.
      for (let k = bi; k < state.books.length; k++) markStructureDirty(k);
      state.hasUnsaved = true;
      renderBody();
      setStatus('Buku dihapus. Jangan lupa klik "Simpan Semua Perubahan".');
      return;
    }

    const addPageBtn = e.target.closest('.fbe-add-page');
    if (addPageBtn) {
      const bi = Number(addPageBtn.dataset.book);
      const book = state.books[bi];
      if (!book) return;
      book.content.push(freshPage());
      renumber(book);
      markStructureDirty(bi);
      state.hasUnsaved = true;
      renderBody();
      setStatus('Halaman baru ditambahkan. Jangan lupa klik "Simpan Semua Perubahan".');
      return;
    }

    const previewBtn = e.target.closest('.fbe-preview-btn');
    if (previewBtn) {
      liveGoTo(Number(previewBtn.dataset.book), null);
      return;
    }

    const removeImgBtn = e.target.closest('.fbe-remove-image');
    if (removeImgBtn) {
      handleRemoveImage(removeImgBtn);
      return;
    }

    const actionBtn = e.target.closest('[data-action]');
    if (!actionBtn) return;

    const action = actionBtn.dataset.action;
    const bi = Number(actionBtn.dataset.book);
    const pi = Number(actionBtn.dataset.page);
    const book = state.books[bi];
    if (!book) return;

    if (action === 'preview-page') {
      liveGoTo(bi, pi + 1);
      return;
    }

    if (action === 'delete-page') {
      if (book.content.length <= 1) {
        setStatus('Setiap buku harus punya minimal 1 halaman isi.', 'error');
        return;
      }
      const ok = window.confirm('Hapus halaman ini?');
      if (!ok) return;
      book.content.splice(pi, 1);
      renumber(book);
      markStructureDirty(bi);
      state.hasUnsaved = true;
      renderBody();
      setStatus('Halaman dihapus. Jangan lupa klik "Simpan Semua Perubahan".');
      return;
    }

    if (action === 'move-up' && pi > 0) {
      const tmp = book.content[pi - 1];
      book.content[pi - 1] = book.content[pi];
      book.content[pi] = tmp;
      renumber(book);
      markStructureDirty(bi);
      state.hasUnsaved = true;
      renderBody();
      return;
    }

    if (action === 'move-down' && pi < book.content.length - 1) {
      const tmp = book.content[pi + 1];
      book.content[pi + 1] = book.content[pi];
      book.content[pi] = tmp;
      renumber(book);
      markStructureDirty(bi);
      state.hasUnsaved = true;
      renderBody();
      return;
    }
  }

  /* ---- upload gambar ---- */
  async function handleFileChange(e) {
    const input = e.target;
    if (input.type !== 'file') return;

    const bi = Number(input.dataset.book);
    const slot = input.dataset.slot;
    const pi = readPageIndex(input.dataset);
    const file = input.files && input.files[0];
    if (!file) return;

    const controlEl = input.closest('.fbe-image-control');
    const statusEl = controlEl ? controlEl.querySelector('.fbe-image-status') : null;

    if (!ALLOWED_MIME.includes(file.type)) {
      if (statusEl) { statusEl.textContent = 'Format tidak didukung (pakai PNG/JPG/WEBP/GIF).'; statusEl.classList.add('is-error'); }
      input.value = '';
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      if (statusEl) { statusEl.textContent = 'Ukuran gambar maksimal 4MB.'; statusEl.classList.add('is-error'); }
      input.value = '';
      return;
    }
    if (!state.password) {
      if (statusEl) { statusEl.textContent = 'Sesi belum terverifikasi, buka ulang mode edit.'; statusEl.classList.add('is-error'); }
      return;
    }

    const target = getBookPage(bi, slot, pi);
    if (!target) { input.value = ''; return; }

    if (statusEl) { statusEl.textContent = 'Mengunggah...'; statusEl.classList.remove('is-error'); }

    const prevPathname = target.image && target.image.pathname ? target.image.pathname : null;

    try {
      const result = await apiUploadImage(file, state.password, prevPathname);
      if (!result.ok || !result.image) {
        if (statusEl) { statusEl.textContent = result.message || 'Gagal mengunggah gambar.'; statusEl.classList.add('is-error'); }
        return;
      }

      target.image = result.image;
      state.hasUnsaved = true;

      if (controlEl) {
        const previewWrap = controlEl.querySelector('.fbe-image-preview');
        if (previewWrap) previewWrap.innerHTML = `<img src="${escapeHtml(result.image.url)}" alt="">`;
        const labelEl = controlEl.querySelector('.fbe-file-btn-label');
        if (labelEl) labelEl.textContent = 'Ganti Gambar';
        if (!controlEl.querySelector('.fbe-remove-image')) {
          const removeBtn = document.createElement('button');
          removeBtn.type = 'button';
          removeBtn.className = 'fbe-btn fbe-btn-ghost fbe-remove-image';
          removeBtn.textContent = 'Hapus Gambar';
          removeBtn.dataset.book = String(bi);
          removeBtn.dataset.slot = slot;
          if (pi != null) removeBtn.dataset.page = String(pi);
          const actionsWrap = controlEl.querySelector('.fbe-image-actions');
          if (actionsWrap) actionsWrap.insertBefore(removeBtn, statusEl);
        }
      }
      if (statusEl) { statusEl.textContent = 'Berhasil diunggah.'; statusEl.classList.remove('is-error'); }

      if (slot === 'cover') livePatchCoverImage(bi, result.image.url);
      else if (slot === 'backCover') livePatchBackImage(bi, result.image.url);
      else if (slot === 'content' && pi != null) livePatchPageImage(bi, pi, result.image.url, target.heading || '');
    } catch (err) {
      if (statusEl) { statusEl.textContent = 'Gagal menghubungi server.'; statusEl.classList.add('is-error'); }
    } finally {
      input.value = '';
    }
  }

  /* ---- hapus gambar ---- */
  async function handleRemoveImage(btn) {
    const bi = Number(btn.dataset.book);
    const slot = btn.dataset.slot;
    const pi = readPageIndex(btn.dataset);

    const target = getBookPage(bi, slot, pi);
    if (!target || !target.image) return;
    if (!state.password) return;

    const controlEl = btn.closest('.fbe-image-control');
    const statusEl = controlEl ? controlEl.querySelector('.fbe-image-status') : null;
    if (statusEl) { statusEl.textContent = 'Menghapus...'; statusEl.classList.remove('is-error'); }

    const pathname = target.image.pathname;
    try {
      await apiDeleteImage(pathname, state.password);
    } catch (err) {
      console.warn('[FlipBookEditor] Gagal hapus blob di server, referensi tetap dihapus dari data lokal:', err);
    }

    target.image = null;
    state.hasUnsaved = true;

    if (controlEl) {
      const previewWrap = controlEl.querySelector('.fbe-image-preview');
      if (previewWrap) previewWrap.innerHTML = '<span>Belum ada gambar</span>';
      const labelEl = controlEl.querySelector('.fbe-file-btn-label');
      if (labelEl) labelEl.textContent = 'Unggah Gambar';
      if (statusEl) statusEl.textContent = '';
      btn.remove();
    }

    if (slot === 'cover') livePatchCoverImage(bi, null);
    else if (slot === 'backCover') livePatchBackImage(bi, null);
    else if (slot === 'content' && pi != null) livePatchPageImage(bi, pi, null);
  }

  /* ---- simpan ---- */
  async function handleSaveClick() {
    if (!state.password) { setStatus('Sesi belum terverifikasi.', 'error'); return; }
    if (!state.books.length) { setStatus('Tambahkan minimal satu buku sebelum menyimpan.', 'error'); return; }

    state.books.forEach(renumber);

    const saveBtn = panelOverlay.querySelector('.fbe-save');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Menyimpan...';
    setStatus('Menyimpan perubahan...');

    try {
      const result = await apiSaveData(state.books, state.password);
      if (!result.ok) {
        setStatus(result.message || 'Gagal menyimpan perubahan.', 'error');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Simpan Semua Perubahan';
        return;
      }

      state.hasUnsaved = false;
      setStatus('Tersimpan! Memuat ulang halaman untuk menampilkan hasil akhir...', 'success');
      setTimeout(() => { window.location.reload(); }, 900);
    } catch (err) {
      setStatus('Gagal menghubungi server.', 'error');
      saveBtn.disabled = false;
      saveBtn.textContent = 'Simpan Semua Perubahan';
    }
  }

  /* ------------------------------------------------------------------ */
  /* Init                                                                */
  /* ------------------------------------------------------------------ */
  function init() {
    buildTrigger();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();