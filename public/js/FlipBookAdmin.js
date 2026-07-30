// js/flipbook-admin.js
//
// Panel admin buat ngedit konten flipbook langsung dari browser: ganti
// judul/sampul buku, tambah/hapus halaman, tulis ulang teks halaman,
// dan ganti/hapus gambar per halaman. Dipasang di ATAS flipbook-scroll.js
// (file itu TIDAK diubah strukturnya, cuma ditambah fetch override --
// lihat komentar di sana) lewat window.__flipBookScrollInstance yang
// sudah dia expose.
//
// Semua kode di sini dibungkus IIFE (function() {...})() SUPAYA helper
// kayak el()/text() di bawah TIDAK BENTROK sama fungsi bernama sama di
// flipbook-scroll.js -- dua file ini dimuat sebagai <script> biasa
// (bukan module), jadi kalau tidak dibungkus, deklarasi top-level bakal
// nimpa punya file lain di scope global yang sama.
//
// CARA PASANG:
//   1. Tambahkan <script src="js/flipbook-admin.js"></script> SETELAH
//      tag <script src="js/flipbook-scroll.js"></script> di HTML kamu
//      (urutan sebenarnya tidak wajib persis begitu karena file ini
//      nunggu/poll sampai window.__flipBookScrollInstance ada, tapi
//      taruh setelahnya biar rapi dibaca).
//   2. Tambahkan <link rel="stylesheet" href="css/flipbook-admin.css">.
//   3. Daftarkan route barunya di server.js:
//        app.use('/api/flipbook', require('./routes/flipbook'));
//      (posisinya bebas, sejajar dengan app.use('/api/qr-bg', ...) yang
//      sudah ada.)

(function () {
  function el(tag, className) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function labeledField(labelText, inputEl) {
    const wrap = el('div', 'fba-field');
    const label = el('label');
    label.textContent = labelText;
    wrap.appendChild(label);
    wrap.appendChild(inputEl);
    return wrap;
  }

  function whenReady(callback) {
    const check = () => {
      if (window.__flipBookScrollInstance && window.__flipBookScrollInstance.sticky) {
        callback(window.__flipBookScrollInstance);
      } else {
        requestAnimationFrame(check);
      }
    };
    check();
  }

  // Salinan DALAM (deep clone) dari buku yang lagi dipakai flipbook,
  // supaya form admin gak ngedit object yang lagi dipakai render
  // flipbook secara langsung sebelum tombol Simpan ditekan.
  function cloneBooks(instance) {
    return JSON.parse(JSON.stringify(instance.books || []));
  }

  /* ----------------------------------------------------------------
     Satu "kartu" form buat satu halaman isi. Balikin { root, refreshTitle,
     readData } -- readData(index) dipanggil pas mau nyimpen, ngasih tau
     data halaman final (entry) plus file gambar baru kalau ada (file).
     ---------------------------------------------------------------- */
  function createPageController(pageData) {
    const root = el('div', 'fba-page-card');

    const header = el('div', 'fba-page-card-header');
    const titleLabel = el('span', 'fba-page-card-title');
    header.appendChild(titleLabel);
    const removeBtn = el('button', 'fba-page-remove');
    removeBtn.type = 'button';
    removeBtn.textContent = 'Hapus halaman';
    header.appendChild(removeBtn);
    root.appendChild(header);

    const pageInput = el('input', 'fba-input');
    pageInput.type = 'text';
    pageInput.placeholder = '01';
    pageInput.value = pageData.page || '';
    root.appendChild(labeledField('Nomor halaman', pageInput));

    const headingInput = el('input', 'fba-input');
    headingInput.type = 'text';
    headingInput.value = pageData.heading || '';
    root.appendChild(labeledField('Judul halaman', headingInput));

    const bodyTextarea = el('textarea', 'fba-textarea');
    bodyTextarea.rows = 4;
    bodyTextarea.value = Array.isArray(pageData.body) ? pageData.body.join('\n\n') : (pageData.body || '');
    root.appendChild(labeledField('Isi teks (pisahkan paragraf dengan baris kosong)', bodyTextarea));

    const listTextarea = el('textarea', 'fba-textarea');
    listTextarea.rows = 3;
    listTextarea.value = Array.isArray(pageData.list) ? pageData.list.join('\n') : '';
    root.appendChild(labeledField('Daftar bullet (satu poin per baris, opsional)', listTextarea));

    // ---- Gambar ----
    // '@@NEW_IMAGE@@' adalah marker dari halaman yang belum sempat
    // di-save (lihat flushCurrentBookState di buildPanel) -- kalau
    // ketemu, anggap TIDAK ADA gambar buat dipreview (file aslinya
    // sudah hilang begitu form-nya dibangun ulang), daripada nyoba
    // nampilin src yang bukan URL gambar beneran.
    let existingImage = (pageData.image && pageData.image.src && pageData.image.src !== '@@NEW_IMAGE@@')
      ? { ...pageData.image }
      : null;

    const imageRow = el('div', 'fba-image-row');
    const preview = el('div', 'fba-image-preview');
    const previewImg = el('img');
    if (existingImage) previewImg.src = existingImage.src;
    else preview.classList.add('empty');
    preview.appendChild(previewImg);
    imageRow.appendChild(preview);

    const imageControls = el('div', 'fba-image-controls');

    let stagedFile = null;
    let imageRemoved = false;

    const fileInput = el('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/png,image/jpeg,image/webp,image/gif';
    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      stagedFile = file;
      imageRemoved = false;
      preview.classList.remove('empty');
      previewImg.src = URL.createObjectURL(file);
    });
    imageControls.appendChild(labeledField('Ganti / tambah gambar', fileInput));

    const removeImageBtn = el('button', 'fba-remove-image');
    removeImageBtn.type = 'button';
    removeImageBtn.textContent = 'Hapus gambar halaman ini';
    removeImageBtn.addEventListener('click', () => {
      imageRemoved = true;
      stagedFile = null;
      fileInput.value = '';
      preview.classList.add('empty');
      previewImg.src = '';
    });
    imageControls.appendChild(removeImageBtn);

    const altInput = el('input', 'fba-input');
    altInput.type = 'text';
    altInput.placeholder = 'Deskripsi gambar (alt text)';
    altInput.value = (existingImage && existingImage.alt) || '';
    imageControls.appendChild(labeledField('Alt text', altInput));

    const captionInput = el('input', 'fba-input');
    captionInput.type = 'text';
    captionInput.placeholder = 'Caption di bawah gambar (opsional)';
    captionInput.value = (existingImage && existingImage.caption) || '';
    imageControls.appendChild(labeledField('Caption', captionInput));

    const layoutSelect = el('select', 'fba-input');
    [['', 'Otomatis'], ['top', 'Gambar di atas'], ['full', 'Latar penuh satu halaman']].forEach(([value, label]) => {
      const opt = el('option');
      opt.value = value;
      opt.textContent = label;
      layoutSelect.appendChild(opt);
    });
    layoutSelect.value = (existingImage && existingImage.layout) || '';
    imageControls.appendChild(labeledField('Tata letak gambar', layoutSelect));

    imageRow.appendChild(imageControls);
    root.appendChild(imageRow);

    removeBtn.addEventListener('click', () => {
      root.dispatchEvent(new CustomEvent('fba:remove'));
    });

    function refreshTitle(n) {
      titleLabel.textContent = `Halaman ${n}`;
    }

    function readData(index) {
      const body = bodyTextarea.value.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
      const list = listTextarea.value.split('\n').map(s => s.trim()).filter(Boolean);

      let image = null;
      if (imageRemoved) {
        image = null;
      } else if (stagedFile) {
        image = {
          src: '@@NEW_IMAGE@@',
          alt: altInput.value.trim(),
          caption: captionInput.value.trim(),
          layout: layoutSelect.value || undefined
        };
      } else if (existingImage) {
        image = {
          ...existingImage,
          alt: altInput.value.trim(),
          caption: captionInput.value.trim(),
          layout: layoutSelect.value || undefined
        };
      }

      const entry = {
        page: pageInput.value.trim() || undefined,
        heading: headingInput.value.trim() || undefined,
        body: body.length > 1 ? body : (body[0] || undefined),
        list: list.length ? list : undefined,
        image
      };

      return {
        entry,
        file: stagedFile ? { field: `image_${index}`, file: stagedFile } : null
      };
    }

    return { root, refreshTitle, readData };
  }

  /* ----------------------------------------------------------------
     Panel utama: overlay + modal, tab pilih buku, form sampul, daftar
     kartu halaman, tombol tambah halaman, kata sandi, dan simpan.
     ---------------------------------------------------------------- */
  function buildPanel(instance) {
    const overlay = el('div', 'fba-overlay');
    const panel = el('div', 'fba-panel');
    overlay.appendChild(panel);

    const header = el('div', 'fba-panel-header');
    const titleEl = el('h3');
    titleEl.textContent = 'Edit Buku Flipbook';
    header.appendChild(titleEl);
    const closeBtn = el('button', 'fba-close');
    closeBtn.type = 'button';
    closeBtn.textContent = '\u00d7';
    header.appendChild(closeBtn);
    panel.appendChild(header);

    const tabs = el('div', 'fba-book-tabs');
    panel.appendChild(tabs);

    const body = el('div', 'fba-panel-body');
    panel.appendChild(body);

    const status = el('div', 'fba-status');
    panel.appendChild(status);

    const footer = el('div', 'fba-panel-footer');
    const passwordInput = el('input', 'fba-input');
    passwordInput.type = 'password';
    passwordInput.placeholder = 'Kata sandi admin';
    footer.appendChild(labeledField('Kata sandi', passwordInput));
    const saveBtn = el('button', 'fba-save-btn');
    saveBtn.type = 'button';
    saveBtn.textContent = 'Simpan Perubahan';
    footer.appendChild(saveBtn);
    panel.appendChild(footer);

    document.body.appendChild(overlay);

    closeBtn.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    const booksState = cloneBooks(instance);
    let activeBookIndex = Math.max(0, Math.min(booksState.length - 1, instance.activeIndex || 0));
    let pageControllers = [];
    let pendingFiles = [];
    const coverFields = {};

    function addPageCard(container, pageData) {
      const controller = createPageController(pageData);
      pageControllers.push(controller);
      controller.root.addEventListener('fba:remove', () => {
        controller.root.remove();
        pageControllers = pageControllers.filter(c => c !== controller);
        renumberCards();
      });
      container.appendChild(controller.root);
      renumberCards();
    }

    function renumberCards() {
      pageControllers.forEach((c, i) => c.refreshTitle(i + 1));
    }

    function renderBookForm() {
      body.innerHTML = '';
      pageControllers = [];
      const book = booksState[activeBookIndex];

      const coverSection = el('div', 'fba-cover-section');

      const titleInput = el('input', 'fba-input');
      titleInput.type = 'text';
      titleInput.value = book.title || '';
      coverSection.appendChild(labeledField('Judul buku (muncul di samping saat scroll)', titleInput));

      const kickerInput = el('input', 'fba-input');
      kickerInput.type = 'text';
      kickerInput.value = (book.cover && book.cover.kicker) || '';
      coverSection.appendChild(labeledField('Label kecil di sampul depan', kickerInput));

      const coverHeadingInput = el('input', 'fba-input');
      coverHeadingInput.type = 'text';
      coverHeadingInput.value = (book.cover && book.cover.heading) || '';
      coverSection.appendChild(labeledField('Judul sampul depan', coverHeadingInput));

      const backHeadingInput = el('input', 'fba-input');
      backHeadingInput.type = 'text';
      backHeadingInput.value = (book.backCover && book.backCover.heading) || '';
      coverSection.appendChild(labeledField('Judul sampul belakang', backHeadingInput));

      const backTaglineInput = el('input', 'fba-input');
      backTaglineInput.type = 'text';
      backTaglineInput.value = (book.backCover && book.backCover.tagline) || '';
      coverSection.appendChild(labeledField('Tagline sampul belakang', backTaglineInput));

      body.appendChild(coverSection);

      coverFields.titleInput = titleInput;
      coverFields.kickerInput = kickerInput;
      coverFields.coverHeadingInput = coverHeadingInput;
      coverFields.backHeadingInput = backHeadingInput;
      coverFields.backTaglineInput = backTaglineInput;

      const pagesWrap = el('div', 'fba-pages-wrap');
      body.appendChild(pagesWrap);

      (book.content || []).forEach((pageData) => addPageCard(pagesWrap, pageData));

      const addBtn = el('button', 'fba-add-page-btn');
      addBtn.type = 'button';
      addBtn.textContent = '+ Tambah Halaman';
      addBtn.addEventListener('click', () => addPageCard(pagesWrap, {}));
      body.appendChild(addBtn);
    }

    function renderTabs() {
      tabs.innerHTML = '';
      booksState.forEach((book, i) => {
        const tab = el('button', 'fba-book-tab' + (i === activeBookIndex ? ' on' : ''));
        tab.type = 'button';
        tab.textContent = book.title || `Buku ${i + 1}`;
        tab.addEventListener('click', () => {
          if (i === activeBookIndex) return;
          flushCurrentBookState();
          activeBookIndex = i;
          renderTabs();
          renderBookForm();
        });
        tabs.appendChild(tab);
      });
    }

    // Nulis balik semua nilai form yang lagi dibuka ke booksState, supaya
    // kalau user pindah tab buku (atau langsung tekan Simpan), datanya
    // gak ilang. CATATAN: gambar yang BARU dipilih (belum di-save) TIDAK
    // ikut "diselamatkan" preview-nya kalau kamu pindah tab lalu balik
    // lagi -- teks tetap aman, tapi kamu perlu pilih ulang filenya.
    function flushCurrentBookState() {
      const book = booksState[activeBookIndex];
      book.title = coverFields.titleInput.value.trim();
      book.cover = {
        kicker: coverFields.kickerInput.value.trim(),
        heading: coverFields.coverHeadingInput.value.trim()
      };
      book.backCover = {
        heading: coverFields.backHeadingInput.value.trim(),
        tagline: coverFields.backTaglineInput.value.trim()
      };

      pendingFiles = [];
      book.content = pageControllers.map((c, i) => {
        const { entry, file } = c.readData(i);
        if (file) pendingFiles.push(file);
        return entry;
      });
    }

    function setStatus(message, kind) {
      status.textContent = message || '';
      status.className = 'fba-status' + (kind ? ` ${kind}` : '');
    }

    saveBtn.addEventListener('click', async () => {
      const password = passwordInput.value;
      if (!password) {
        setStatus('Isi kata sandi dulu.', 'error');
        return;
      }

      flushCurrentBookState();
      const bookData = booksState[activeBookIndex];

      const formData = new FormData();
      formData.append('password', password);
      formData.append('bookData', JSON.stringify(bookData));
      pendingFiles.forEach(({ field, file }) => formData.append(field, file));

      saveBtn.disabled = true;
      setStatus('Menyimpan...', '');

      try {
        const res = await fetch(`/api/flipbook/${activeBookIndex}/save`, {
          method: 'POST',
          body: formData
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
          setStatus(data.message || 'Gagal menyimpan.', 'error');
          saveBtn.disabled = false;
          return;
        }

        setStatus('Tersimpan! Memuat ulang halaman...', 'success');
        setTimeout(() => window.location.reload(), 900);
      } catch (err) {
        console.error('[flipbook-admin] Gagal menyimpan:', err);
        setStatus('Gagal menghubungi server.', 'error');
        saveBtn.disabled = false;
      }
    });

    renderTabs();
    renderBookForm();
  }

  function attachTrigger(instance) {
    const trigger = el('button', 'fba-trigger');
    trigger.type = 'button';
    trigger.title = 'Edit buku';
    trigger.textContent = '\u270e'; // ikon pensil
    trigger.addEventListener('click', () => buildPanel(instance));
    instance.sticky.appendChild(trigger);
  }

  whenReady(attachTrigger);
})();