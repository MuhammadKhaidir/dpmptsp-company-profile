const clamp01 = t => Math.min(1, Math.max(0, t));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
const easeInCubic = t => t * t * t;

const ENTER_END = 0.22;
const EXIT_START = 0.90;

const SIDE_MARGIN = 800;
const SIDE_ROT = 30;
const OPEN_SCALE_BUMP = 0.14;
const TEXT_REVEAL_RISE = 18;

// FITUR EDIT: endpoint backend (routes/flipbookContent.js), dipasang di
// server lewat app.use('/api/flipbook', require('./routes/flipbookContent')).
const FLIPBOOK_API = {
  content: '/api/flipbook/content',
  editPage: '/api/flipbook/page',
  addPage: '/api/flipbook/page/add',
  deletePage: '/api/flipbook/page/delete',
  deleteBook: '/api/flipbook/book/delete'
};

const DEFAULT_BOOKS = [
  {
    title: 'Sejarah & Latar Belakang',
    cover: {
      kicker: 'DPMPTSP KOTA PALEMBANG',
      heading: 'Sejarah & Latar Belakang'
    },
    content: [
      { page: '01', heading: 'Awal Pembentukan', body: 'DPMPTSP Kota Palembang dibentuk sebagai jawaban atas kebutuhan pelayanan perizinan yang lebih cepat, transparan, dan terintegrasi dalam satu atap.' },
      { page: '02', heading: 'Perluasan Layanan', body: 'Cakupan layanan terus diperluas, mulai dari izin usaha dan izin lokasi hingga rekomendasi teknis lintas sektor, agar masyarakat tak perlu berpindah-pindah instansi.' },
      { page: '03', heading: 'Menuju Digitalisasi', body: 'Transformasi digital jadi arah utama, dengan sistem pengaduan dan pemantauan perizinan yang bisa diakses langsung secara online oleh masyarakat.' }
    ],
    backCover: { heading: 'DPMPTSP', tagline: 'Kota Palembang' }
  },
  {
    title: 'Visi & Misi',
    cover: {
      kicker: 'DPMPTSP KOTA PALEMBANG',
      heading: 'Visi & Misi'
    },
    content: [
      { page: '01', heading: 'Visi', body: 'Mewujudkan pelayanan perizinan dan penanaman modal yang cepat, transparan, dan berorientasi pada kepuasan masyarakat.' },
      { page: '02', heading: 'Misi Pelayanan', body: 'Meningkatkan kualitas pelayanan publik lewat proses yang sederhana, terukur, dan dapat dipertanggungjawabkan kepada masyarakat.' },
      { page: '03', heading: 'Misi Digital', body: 'Mempercepat proses perizinan berbasis digital serta membuka ruang partisipasi dan pengaduan masyarakat seluas-luasnya.' }
    ],
    backCover: { heading: 'Visi & Misi', tagline: 'DPMPTSP Kota Palembang' }
  },
  {
    title: 'Struktur & Layanan',
    cover: {
      kicker: 'DPMPTSP KOTA PALEMBANG',
      heading: 'Struktur & Layanan'
    },
    content: [
      { page: '01', heading: 'Loket Pelayanan', body: 'Setiap permohonan diterima lewat loket terpadu, diverifikasi kelengkapan berkasnya, lalu diproses lintas bidang teknis terkait.' },
      { page: '02', heading: 'Tim Verifikasi', body: 'Petugas verifikasi meninjau kelayakan berkas dan menindaklanjuti laporan atau pengaduan yang masuk dari masyarakat.' },
      { page: '03', heading: 'Pengawasan Internal', body: 'Inspektorat internal memantau proses pelayanan agar tetap sesuai standar, termasuk menindak dugaan pelanggaran oleh petugas.' }
    ],
    backCover: { heading: 'Struktur', tagline: '& Layanan' }
  }
];

function el(tag, className) {
  const node = document.createElement(tag || 'div');
  if (className) node.className = className;
  return node;
}

function text(tag, className, content) {
  const node = el(tag, className);
  node.textContent = content || '';
  return node;
}

// FITUR EDIT: tombol pensil kecil buat buka modal edit. Selalu tampil
// separuh transparan (bukan cuma pas hover) -- soalnya .fb-book pakai
// pointer-events:none, jadi hover di FACE-nya gak pernah nyampe ke CSS
// (event-nya udah "tembus" duluan). Tombolnya sendiri tetap punya
// pointer-events:auto jadi tetap bisa diklik & punya hover-nya sendiri.
function buildEditButton(onEdit) {
  const btn = el('button', 'fb-edit-btn');
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Edit halaman ini');
  btn.textContent = '✎';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (onEdit) onEdit();
  });
  return btn;
}

// FITUR HAPUS HALAMAN: tombol tempat sampah kecil, pola & alasan sama
// persis kayak buildEditButton di atas -- cuma dipasang di pojok kiri
// (edit di kanan), dan CUMA muncul di halaman ISI (lihat buildTextFace),
// gak muncul di sampul depan/belakang karena itu bukan hal yang bisa
// "dihapus" satuan (dihapus bareng seluruh buku lewat tombol "Hapus
// Buku Ini").
function buildDeleteButton(onDelete) {
  const btn = el('button', 'fb-delete-btn');
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Hapus halaman ini');
  btn.textContent = '🗑';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (onDelete) onDelete();
  });
  return btn;
}

function buildCoverFace(data, onEdit) {
  const face = el('div', 'fb-page-face fb-face-cover');
  const img = el('img', 'fb-face-image');
  img.hidden = !(data.image && data.image.url);
  if (data.image && data.image.url) img.src = data.image.url;
  const reveal = el('div', 'fb-reveal');
  const kickerEl = text('p', 'fb-kicker', data.kicker);
  const headingEl = text('h3', 'fb-cover-heading', data.heading);
  reveal.appendChild(kickerEl);
  reveal.appendChild(headingEl);
  face.appendChild(img);
  face.appendChild(reveal);
  if (onEdit) face.appendChild(buildEditButton(onEdit));
  return {
    el: face,
    reveal,
    image: img,
    fields: { kicker: kickerEl, heading: headingEl }
  };
}

function buildTextFace(data, onEdit, onDelete) {
  const face = el('div', 'fb-page-face fb-face-text');
  const img = el('img', 'fb-face-image');
  img.hidden = !(data.image && data.image.url);
  if (data.image && data.image.url) img.src = data.image.url;
  const reveal = el('div', 'fb-reveal');
  const pageNumEl = text('p', 'fb-page-num', data.page ? `Hal. ${data.page}` : '');
  const headingEl = text('h4', 'fb-page-heading', data.heading);
  const bodyEl = text('p', 'fb-page-body', data.body);
  reveal.appendChild(pageNumEl);
  reveal.appendChild(headingEl);
  reveal.appendChild(bodyEl);
  face.appendChild(img);
  face.appendChild(reveal);
  if (onEdit) face.appendChild(buildEditButton(onEdit));
  if (onDelete) face.appendChild(buildDeleteButton(onDelete));
  return {
    el: face,
    reveal,
    image: img,
    fields: { pageNum: pageNumEl, heading: headingEl, body: bodyEl }
  };
}

function buildBackFace(data, onEdit) {
  const face = el('div', 'fb-page-face fb-face-back');
  const img = el('img', 'fb-face-image');
  img.hidden = !(data.image && data.image.url);
  if (data.image && data.image.url) img.src = data.image.url;
  const reveal = el('div', 'fb-reveal');
  const headingEl = text('h4', 'fb-back-heading', data.heading);
  const taglineEl = text('p', 'fb-back-tagline', data.tagline);
  reveal.appendChild(headingEl);
  reveal.appendChild(taglineEl);
  face.appendChild(img);
  face.appendChild(reveal);
  if (onEdit) face.appendChild(buildEditButton(onEdit));
  return {
    el: face,
    reveal,
    image: img,
    fields: { heading: headingEl, tagline: taglineEl }
  };
}

function buildBlankFace() {
  return { el: el('div', 'fb-page-face fb-face-blank'), reveal: null, image: null, fields: {} };
}

function buildFace(entry, onEdit, onDelete) {
  if (entry.kind === 'cover') return buildCoverFace(entry, onEdit);
  if (entry.kind === 'back') return buildBackFace(entry, onEdit);
  if (entry.kind === 'blank') return buildBlankFace();
  return buildTextFace(entry, onEdit, onDelete);
}

function openScaleBump(spreadT) {
  return 1 + OPEN_SCALE_BUMP * spreadT;
}

class FlipBook {
  constructor(stage, book, index, callbacks, isLast) {
    this.index = index;
    this.callbacks = callbacks || {};

    // FIX: buku TERAKHIR gak boleh "ngilang" (geser keluar + fade opacity
    // ke 0) kayak buku-buku lain begitu selesai discroll. Flag ini
    // dikirim dari FlipBookScroll.makeFlipBook (dihitung dari posisi buku
    // di array this.books) dan dipakai di update() buat skip animasi
    // exit-nya sama sekali -- jadi buku terakhir cuma "berhenti" di
    // keadaan tertutup, bukan menghilang.
    this.isLast = !!isLast;

    this.enterSide = index % 2 === 0 ? -1 : 1;
    this.exitSide = -this.enterSide;

    const src = book && book.cover && book.content && book.content.length ? book : DEFAULT_BOOKS[index % 3];
    const leaves = [
      { kind: 'cover', ...src.cover },
      ...src.content.map(c => ({ kind: 'text', ...c }))
    ];
    const backData = { kind: 'back', ...(src.backCover || {}) };

    this.pageCount = leaves.length;
    this.pageWidth = 0;
    this.travelPx = 0;
    this.lastOpacity = 0;

    this.root = el('div', 'fb-book');
    this.root.style.zIndex = '0';
    this.root.style.display = 'none';

    // FITUR: TOMBOL AKSI BUKU (TAMBAH/HAPUS) CUMA MUNCUL PAS BUKU DIKLIK
    // Klik di badan buku (bukan di tombol pensil/tempat sampah kecil yang
    // masing-masing sudah e.stopPropagation() duluan di buildEditButton/
    // buildDeleteButton) buat toggle tampil/sembunyi panel "Tambah
    // Halaman"/"Hapus Buku Ini" di FlipBookScroll. Ditaruh di root
    // .fb-book (bukan di satu face doang) soalnya semua halaman/sampul
    // numpuk penuh (inset:0) ngisi seluruh badan buku ini, jadi klik di
    // face mana pun tetap ke-bubble sampai sini.
    this.root.addEventListener('click', () => {
      if (this.callbacks.onBookClick) this.callbacks.onBookClick(this.index);
    });

    this.shadow = el('div', 'fb-shadow');
    this.root.appendChild(this.shadow);

    this.pageEls = [];

    // FITUR EDIT: referensi tiap face yang BOLEH diedit, dipakai sama
    // applyEdit() buat update tulisan/gambar langsung di DOM tanpa
    // bongkar ulang seluruh buku (biar gak ganggu animasi yang lagi
    // jalan). editableFronts[0] = sampul depan, editableFronts[1..] =
    // halaman isi (index p, sama kayak posisi leaf). editableBack =
    // sampul belakang (cuma ada di leaf terakhir).
    this.editableFronts = [];
    this.editableBack = null;

    leaves.forEach((leafData, p) => {
      const page = el('div', 'fb-page');
      const leafType = p === 0 ? 'cover' : 'content';
      const contentIndex = p === 0 ? null : p - 1;

      const frontBuilt = buildFace(
        leafData,
        () => {
          if (this.callbacks.onEdit) this.callbacks.onEdit(leafType, contentIndex);
        },
        leafType === 'content'
          ? () => {
              if (this.callbacks.onDeletePage) this.callbacks.onDeletePage(contentIndex);
            }
          : null
      );
      const front = frontBuilt.el;
      front.classList.add('fb-page-front');
      this.editableFronts[p] = { leafType, contentIndex, built: frontBuilt };

      const isLast = p === leaves.length - 1;
      const backBuilt = isLast
        ? buildFace(backData, () => {
            if (this.callbacks.onEdit) this.callbacks.onEdit('back', null);
          })
        : buildFace({ kind: 'blank' });
      const back = backBuilt.el;
      back.classList.add('fb-page-back');
      if (isLast) this.editableBack = { leafType: 'back', contentIndex: null, built: backBuilt };

      const shade = el('div', 'fb-page-shade');

      page.appendChild(front);
      page.appendChild(back);
      page.appendChild(shade);
      this.root.appendChild(page);
      this.pageEls.push({
        page,
        shade,
        frontReveal: frontBuilt.reveal,
        backReveal: backBuilt.reveal
      });
    });

    this.spine = el('div', 'fb-spine');
    this.root.appendChild(this.spine);

    stage.appendChild(this.root);
    this.measure();
  }

  measure() {
    const measuredWidth = this.root.offsetWidth;
    if (measuredWidth > 0) {
      this.pageWidth = measuredWidth;
    } else if (!this.pageWidth) {
      this.pageWidth = 280;
    }
    const vw = window.innerWidth || 1000;
    this.travelPx = vw / 2 + this.pageWidth / 2 + SIDE_MARGIN;
  }

  // FITUR EDIT: update tulisan/gambar satu leaf langsung di DOM yang
  // sudah ada, tanpa rebuild. leafData = objek leaf terbaru dari server
  // (hasil response backend), berisi field teks + { image: { url } }.
  applyEdit(leafType, contentIndex, leafData) {
    let target;
    if (leafType === 'cover') target = this.editableFronts[0];
    else if (leafType === 'back') target = this.editableBack;
    else target = this.editableFronts[contentIndex + 1];

    if (!target) return;
    const built = target.built;
    const fields = built.fields || {};

    if (fields.kicker) fields.kicker.textContent = leafData.kicker || '';
    if (fields.heading) fields.heading.textContent = leafData.heading || '';
    if (fields.body) fields.body.textContent = leafData.body || '';
    if (fields.tagline) fields.tagline.textContent = leafData.tagline || '';
    if (fields.pageNum) fields.pageNum.textContent = leafData.page ? `Hal. ${leafData.page}` : '';

    if (built.image) {
      if (leafData.image && leafData.image.url) {
        built.image.src = leafData.image.url;
        built.image.hidden = false;
      } else {
        built.image.hidden = true;
        built.image.removeAttribute('src');
      }
    }
  }

  update(local) {
    if (!this.pageWidth || this.pageWidth === 320) {
      this.measure();
    }

    let xOffset, rot, scale, opacity, openLocal;

    if (local <= ENTER_END) {
      const t = easeOutCubic(clamp01(local / ENTER_END));
      xOffset = lerp(this.enterSide * this.travelPx, 0, t);
      rot = lerp(this.enterSide * -SIDE_ROT, 0, t);
      scale = lerp(0.7, 1, t);
      opacity = t;
      openLocal = 0;
    } else if (local >= EXIT_START) {
      if (this.isLast) {
        // FIX: buku terakhir -- begitu selesai dibaca (openLocal udah
        // nyampe 1, alias tertutup lagi), JANGAN lanjut animasi keluar
        // (geser ke samping + mengecil + fade opacity ke 0) kayak buku
        // lain. Biarin dia diem di tengah, tetap 100% kelihatan, dalam
        // keadaan tertutup -- nanti begitu lock discroll dilepas
        // (releaseLock di FlipBookScroll), dia "kebawa" scroll halaman
        // biasa lewat posisi sticky-nya yang lepas, bukan menghilang
        // duluan sebelum sempat kelihatan.
        xOffset = 0;
        rot = 0;
        scale = 1;
        opacity = 1;
      } else {
        const t = easeInCubic(clamp01((local - EXIT_START) / (1 - EXIT_START)));
        xOffset = lerp(0, this.exitSide * this.travelPx, t);
        rot = lerp(0, this.exitSide * -SIDE_ROT, t);
        scale = lerp(1, 0.7, t);
        opacity = 1 - t;
      }
      openLocal = 1;
    } else {
      xOffset = 0;
      rot = 0;
      opacity = 1;
      openLocal = (local - ENTER_END) / (EXIT_START - ENTER_END);
    }

    const n = this.pageCount;

    const coverT = clamp01(openLocal * n);
    const closeT = clamp01((openLocal - (n - 1) / n) * n);
    const spreadT = coverT * (1 - closeT);

    const isReading = local > ENTER_END && local < EXIT_START;
    if (isReading) {
      scale = openScaleBump(spreadT);
    }

    const shiftPx = (this.pageWidth / 2) * spreadT;

    this.root.style.transform =
      `translate(-50%, -50%) translateX(${xOffset}px) translateX(${shiftPx}px) rotateY(${rot}deg) scale(${scale})`;
    this.root.style.opacity = String(opacity);

    // FIX: buku terakhir gak boleh ke-hide walau local udah nyampe 1 --
    // setelah lock dilepas & user lanjut scroll ke bawah biasa, `local`
    // buku ini bakal nyangkut/nempel di 1 terus, dan kalau tetap kena
    // hide di sini dia bakal "kedip hilang" pas lock-nya lepas. Buku-buku
    // lain tetap di-hide di local>=1 kayak biasa (di titik itu mereka
    // emang udah 100% invisible/off-screen -- ngilangin elemennya dari
    // render itu optimisasi biasa, bukan bagian dari animasi).
    const shouldHide = opacity <= 0.001 || local <= 0 || (local >= 1 && !this.isLast);

    if (shouldHide) {
      this.root.style.visibility = 'hidden';
      this.root.style.display = 'none';
      this.root.style.zIndex = '0';
    } else {
      this.root.style.visibility = 'visible';
      this.root.style.display = 'block';
      this.root.style.zIndex = opacity > 0.01 ? '500' : '0';
    }

    this.lastOpacity = opacity;
    const enterProgress = local <= ENTER_END ? easeOutCubic(clamp01(local / ENTER_END)) : 1;

    const BASE_Z = 500;
    let prevPageT = enterProgress;

    this.pageEls.forEach((entry, p) => {
      const ps = p / n;
      const pe = (p + 1) / n;
      const t = clamp01((openLocal - ps) / (pe - ps));

      const flipDeg = -180 * t;
      entry.page.style.transform = `rotateY(${flipDeg}deg)`;
      entry.shade.style.opacity = String(Math.sin(t * Math.PI) * 0.45);

      let z;
      if (t <= 0) z = BASE_Z - p;
      else if (t >= 1) z = BASE_Z + p;
      else z = BASE_Z + n + 10;
      entry.page.style.zIndex = String(z);

      if (entry.frontReveal) {
        const r = easeOutCubic(clamp01(prevPageT));
        entry.frontReveal.style.setProperty('--fb-reveal-o', String(r));
        entry.frontReveal.style.setProperty('--fb-reveal-y', `${(1 - r) * TEXT_REVEAL_RISE}px`);
      }

      if (entry.backReveal) {
        const r = easeOutCubic(t);
        entry.backReveal.style.setProperty('--fb-reveal-o', String(r));
        entry.backReveal.style.setProperty('--fb-reveal-y', `${(1 - r) * TEXT_REVEAL_RISE}px`);
      }

      prevPageT = t;
    });
  }
}

class FlipBookScroll {
  constructor(container, config) {
    this.container = container;
    this.books = config.books && config.books.length ? config.books : DEFAULT_BOOKS;
    this.segmentVh = config.segmentVh || 220;

    this.inView = true;
    this.activeIndex = -1;
    this.locked = false;
    this.progress = 0;
    this.savedScrollY = 0;
    this.lastScrollY = null;
    this.renderTicking = false;
    this.touchY = 0;
    this.pinStart = 0;
    this.pinEnd = 0;
    this.totalDistance = 1;

    // FIX SCROLL: state buat nyuspend sementara reentry-lock pas ada
    // navigasi lewat anchor link (mis. klik nav "Maps"/"Dokumen" dsb).
    // Lihat onAnchorNavClick(), armSuppressRelease(), dan checkReentry().
    this.suppressReentry = false;
    this._suppressTimer = null;
    this._suppressLastY = null;
    this._suppressStart = 0;

    // FITUR: state buka/tutup panel tombol "Tambah Halaman"/"Hapus Buku
    // Ini" -- defaultnya TERTUTUP total, baru kebuka kalau badan buku
    // yang lagi aktif diklik (lihat toggleBookActions()).
    this.actionsOpen = false;

    // FITUR EDIT: state modal edit / tambah halaman / hapus.
    this.editModalOpen = false;
    this.editState = null;
    this.editFieldRefs = {};

    this.build();
    this.addEvents();

    this.recomputeBounds();
    this.checkReentry();
    this.render();
  }

  build() {
    this.container.classList.add('flipbook-scroll-wrap');
    this.container.style.position = 'relative';
    this.container.style.height = `${this.books.length * this.segmentVh}vh`;

    this.sticky = el('div', 'flipbook-scroll-sticky');
    this.container.appendChild(this.sticky);

    this.caption = el('div', 'fb-caption');
    this.sticky.appendChild(this.caption);

    this.stage = el('div', 'fb-stage');
    this.sticky.appendChild(this.stage);

    this.dotsWrap = el('div', 'fb-dots');
    this.books.forEach(() => this.dotsWrap.appendChild(el('span', 'fb-dot')));
    this.sticky.appendChild(this.dotsWrap);

    // FITUR EDIT + HAPUS: wrapper buat tombol "+ Tambah Halaman" &
    // "Hapus Buku Ini" biar bisa disandingkan di posisi yang sama
    // (dulu cuma ada satu tombol tambah halaman doang di sini). Defaultnya
    // disembunyikan lewat CSS (.fb-book-actions), baru muncul lewat class
    // .is-open pas buku aktif diklik (lihat toggleBookActions() di bawah).
    this.bookActionsWrap = el('div', 'fb-book-actions');
    this.sticky.appendChild(this.bookActionsWrap);

    this.addPageBtn = el('button', 'fb-add-page-btn');
    this.addPageBtn.type = 'button';
    this.addPageBtn.textContent = '+ Tambah Halaman';
    this.addPageBtn.addEventListener('click', () => this.openAddPageModal(this.activeIndex));
    this.bookActionsWrap.appendChild(this.addPageBtn);

    this.deleteBookBtn = el('button', 'fb-delete-book-btn');
    this.deleteBookBtn.type = 'button';
    this.deleteBookBtn.textContent = 'Hapus Buku Ini';
    this.deleteBookBtn.addEventListener('click', () => this.openDeleteBookModal(this.activeIndex));
    this.bookActionsWrap.appendChild(this.deleteBookBtn);

    this.flipBooks = this.books.map((book, i) => this.makeFlipBook(book, i));

    this.buildEditOverlay();
  }

  // FITUR HAPUS: dipusatkan di sini (dipakai pas build() awal, maupun
  // pas rebuildBook()/rebuildAll() sesudah tambah/hapus halaman/buku),
  // biar callback onEdit/onDeletePage/onBookClick-nya konsisten di semua
  // jalur.
  makeFlipBook(book, index) {
    return new FlipBook(this.stage, book, index, {
      onEdit: (leafType, contentIndex) => this.openEditModal(index, leafType, contentIndex),
      onDeletePage: (contentIndex) => this.openDeletePageModal(index, contentIndex),
      onBookClick: () => this.toggleBookActions(index)
    }, index === this.books.length - 1);
  }

  // FITUR: TOMBOL AKSI BUKU (TAMBAH/HAPUS) CUMA MUNCUL PAS BUKU DIKLIK
  // Toggle tampil/sembunyi this.bookActionsWrap. Dipanggil dari listener
  // 'click' yang dipasang di FlipBook.root (lihat constructor FlipBook).
  // Guard `index !== this.activeIndex` -- cuma buku yang LAGI AKTIF di
  // layar yang boleh buka panelnya (buku yang lagi transisi masuk/keluar
  // diabaikan; lagipula begitu opacity-nya ~0, buku itu display:none jadi
  // gak akan pernah "kena klik").
  toggleBookActions(index) {
    if (index !== this.activeIndex) return;
    this.actionsOpen = !this.actionsOpen;
    this.bookActionsWrap.classList.toggle('is-open', this.actionsOpen);
  }

  closeBookActions() {
    if (!this.actionsOpen) return;
    this.actionsOpen = false;
    this.bookActionsWrap.classList.remove('is-open');
  }

  // FITUR EDIT: modal edit / tambah halaman / hapus -- dibangun SEKALI,
  // dipasang langsung ke <body> (bukan di dalam .fb-stage) biar
  // posisinya gak kena reflow/transform dari animasi buku, sama kayak
  // alasan cat mascot dipindah ke position:fixed nempel di <body>.
  buildEditOverlay() {
    const overlay = el('div', 'fb-edit-overlay');
    overlay.hidden = true;

    const modal = el('div', 'fb-edit-modal');
    overlay.appendChild(modal);

    const closeBtn = el('button', 'fb-edit-close');
    closeBtn.type = 'button';
    closeBtn.textContent = '×';
    closeBtn.setAttribute('aria-label', 'Tutup');
    modal.appendChild(closeBtn);

    const title = text('h4', 'fb-edit-title', 'Edit Halaman');
    modal.appendChild(title);

    const sub = el('p', 'fb-edit-sub');
    sub.hidden = true;
    modal.appendChild(sub);

    const fieldsWrap = el('div', 'fb-edit-fields');
    modal.appendChild(fieldsWrap);

    const imageRow = el('div', 'fb-edit-image-row');
    const imagePreview = el('img', 'fb-edit-image-preview');
    imagePreview.hidden = true;
    const imageInput = el('input', 'fb-edit-image-input');
    imageInput.type = 'file';
    imageInput.accept = 'image/png,image/jpeg,image/webp,image/gif';
    imageRow.appendChild(imagePreview);
    imageRow.appendChild(imageInput);
    modal.appendChild(imageRow);

    const passwordLabel = el('label', 'fb-edit-password-label');
    passwordLabel.textContent = 'Kata sandi edit';
    const passwordInput = el('input', 'fb-edit-password-input');
    passwordInput.type = 'password';
    passwordInput.placeholder = 'Masukkan kata sandi';
    passwordLabel.appendChild(passwordInput);
    modal.appendChild(passwordLabel);

    const errorMsg = el('p', 'fb-edit-error');
    errorMsg.hidden = true;
    modal.appendChild(errorMsg);

    const actions = el('div', 'fb-edit-actions');
    const cancelBtn = el('button', 'fb-edit-cancel');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Batal';
    const saveBtn = el('button', 'fb-edit-save');
    saveBtn.type = 'button';
    saveBtn.textContent = 'Simpan';
    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);
    modal.appendChild(actions);

    document.body.appendChild(overlay);

    this.editOverlay = overlay;
    this.editModal = modal;
    this.editTitleEl = title;
    this.editSubEl = sub;
    this.editFieldsWrap = fieldsWrap;
    this.editImageRow = imageRow;
    this.editImagePreview = imagePreview;
    this.editImageInput = imageInput;
    this.editPasswordInput = passwordInput;
    this.editErrorEl = errorMsg;
    this.editSaveBtn = saveBtn;

    imageInput.addEventListener('change', () => {
      const file = imageInput.files && imageInput.files[0];
      if (!file) return;
      imagePreview.src = URL.createObjectURL(file);
      imagePreview.hidden = false;
    });

    closeBtn.addEventListener('click', () => this.closeEditModal());
    cancelBtn.addEventListener('click', () => this.closeEditModal());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.closeEditModal();
    });
    saveBtn.addEventListener('click', () => this.submitEditModal());
  }

  // FITUR EDIT: buka modal buat ngedit satu leaf (cover/content/back).
  openEditModal(bookIndex, leafType, contentIndex) {
    const book = this.books[bookIndex];
    if (!book) return;

    let leaf;
    if (leafType === 'cover') leaf = book.cover || {};
    else if (leafType === 'back') leaf = book.backCover || {};
    else leaf = (book.content && book.content[contentIndex]) || {};

    this.editState = { mode: 'edit', bookIndex, leafType, contentIndex };

    this.editTitleEl.textContent = 'Edit Halaman';
    this.editSubEl.hidden = true;
    this.editSaveBtn.textContent = 'Simpan';
    this.editSaveBtn.classList.remove('fb-edit-save-danger');
    this.editFieldsWrap.hidden = false;
    this.editFieldsWrap.innerHTML = '';
    this.editFieldRefs = {};

    const addField = (key, labelText, value, multiline) => {
      const label = el('label', 'fb-edit-field-label');
      label.textContent = labelText;
      const input = el(multiline ? 'textarea' : 'input', 'fb-edit-field-input');
      if (!multiline) input.type = 'text';
      input.value = value || '';
      label.appendChild(input);
      this.editFieldsWrap.appendChild(label);
      this.editFieldRefs[key] = input;
    };

    if (leafType === 'cover') {
      addField('kicker', 'Label kecil', leaf.kicker, false);
      addField('heading', 'Judul sampul', leaf.heading, false);
    } else if (leafType === 'back') {
      addField('heading', 'Judul sampul belakang', leaf.heading, false);
      addField('tagline', 'Tagline', leaf.tagline, false);
    } else {
      addField('page', 'Nomor halaman', leaf.page, false);
      addField('heading', 'Judul halaman', leaf.heading, false);
      addField('body', 'Isi halaman', leaf.body, true);
    }

    this.editImageRow.hidden = false;
    this.editImageInput.value = '';
    if (leaf.image && leaf.image.url) {
      this.editImagePreview.src = leaf.image.url;
      this.editImagePreview.hidden = false;
    } else {
      this.editImagePreview.hidden = true;
      this.editImagePreview.removeAttribute('src');
    }

    this.editErrorEl.hidden = true;
    this.editPasswordInput.value = '';

    this.editModalOpen = true;
    this.editOverlay.hidden = false;
  }

  // FITUR EDIT: buka modal buat nambah halaman baru di buku yang lagi aktif.
  openAddPageModal(bookIndex) {
    if (bookIndex == null || bookIndex < 0 || !this.books[bookIndex]) return;
    this.editState = { mode: 'add', bookIndex };

    this.editTitleEl.textContent = 'Tambah Halaman Baru';
    this.editSubEl.hidden = true;
    this.editSaveBtn.textContent = 'Tambah';
    this.editSaveBtn.classList.remove('fb-edit-save-danger');
    this.editFieldsWrap.hidden = true;
    this.editFieldsWrap.innerHTML = '';
    this.editFieldRefs = {};

    this.editImageRow.hidden = true;
    this.editImageInput.value = '';
    this.editImagePreview.hidden = true;
    this.editImagePreview.removeAttribute('src');

    this.editErrorEl.hidden = true;
    this.editPasswordInput.value = '';

    this.editModalOpen = true;
    this.editOverlay.hidden = false;
  }

  // FITUR HAPUS: buka modal konfirmasi buat hapus SATU halaman isi.
  openDeletePageModal(bookIndex, contentIndex) {
    const book = this.books[bookIndex];
    const leaf = book && book.content && book.content[contentIndex];
    if (!leaf) return;

    this.editState = { mode: 'deletePage', bookIndex, contentIndex };

    this.editTitleEl.textContent = 'Hapus Halaman Ini?';
    this.editSubEl.hidden = false;
    this.editSubEl.textContent = 'Halaman "' + (leaf.heading || ('Hal. ' + leaf.page)) + '" akan dihapus permanen dari buku ini.';
    this.editSaveBtn.textContent = 'Hapus';
    this.editSaveBtn.classList.add('fb-edit-save-danger');
    this.editFieldsWrap.hidden = true;
    this.editFieldsWrap.innerHTML = '';
    this.editFieldRefs = {};

    this.editImageRow.hidden = true;
    this.editImageInput.value = '';
    this.editImagePreview.hidden = true;
    this.editImagePreview.removeAttribute('src');

    this.editErrorEl.hidden = true;
    this.editPasswordInput.value = '';

    this.editModalOpen = true;
    this.editOverlay.hidden = false;
  }

  // FITUR HAPUS: buka modal konfirmasi buat hapus SATU BUKU utuh. Gak
  // dipanggil sama sekali kalau cuma sisa 1 buku (lihat render() -- tombol
  // Hapus Buku Ini otomatis ke-disable), tapi tetap dijaga di sini juga.
  openDeleteBookModal(bookIndex) {
    const book = this.books[bookIndex];
    if (!book || this.books.length <= 1) return;

    this.editState = { mode: 'deleteBook', bookIndex };

    this.editTitleEl.textContent = 'Hapus Buku Ini?';
    this.editSubEl.hidden = false;
    this.editSubEl.textContent = 'Buku "' + (book.title || '') + '" beserta SEMUA halaman & gambar di dalamnya akan dihapus permanen. Tindakan ini gak bisa dibatalin.';
    this.editSaveBtn.textContent = 'Hapus';
    this.editSaveBtn.classList.add('fb-edit-save-danger');
    this.editFieldsWrap.hidden = true;
    this.editFieldsWrap.innerHTML = '';
    this.editFieldRefs = {};

    this.editImageRow.hidden = true;
    this.editImageInput.value = '';
    this.editImagePreview.hidden = true;
    this.editImagePreview.removeAttribute('src');

    this.editErrorEl.hidden = true;
    this.editPasswordInput.value = '';

    this.editModalOpen = true;
    this.editOverlay.hidden = false;
  }

  closeEditModal() {
    this.editModalOpen = false;
    this.editOverlay.hidden = true;
    this.editState = null;
  }

  showEditError(message) {
    this.editErrorEl.textContent = message;
    this.editErrorEl.hidden = false;
  }

  async submitEditModal() {
    if (!this.editState) return;
    const password = this.editPasswordInput.value;
    if (!password) {
      this.showEditError('Kata sandi wajib diisi.');
      return;
    }

    this.editSaveBtn.disabled = true;
    this.editErrorEl.hidden = true;

    try {
      if (this.editState.mode === 'add') {
        await this.submitAddPage(this.editState.bookIndex, password);
      } else if (this.editState.mode === 'deletePage') {
        await this.submitDeletePage(this.editState.bookIndex, this.editState.contentIndex, password);
      } else if (this.editState.mode === 'deleteBook') {
        await this.submitDeleteBook(this.editState.bookIndex, password);
      } else {
        await this.submitPageEdit(this.editState, password);
      }
    } finally {
      this.editSaveBtn.disabled = false;
    }
  }

  async submitPageEdit(state, password) {
    const fd = new FormData();
    fd.append('bookIndex', String(state.bookIndex));
    fd.append('leafType', state.leafType);
    if (state.leafType === 'content') fd.append('contentIndex', String(state.contentIndex));
    Object.keys(this.editFieldRefs).forEach((key) => {
      fd.append(key, this.editFieldRefs[key].value);
    });
    fd.append('password', password);
    const file = this.editImageInput.files && this.editImageInput.files[0];
    if (file) fd.append('image', file);

    try {
      const res = await fetch(FLIPBOOK_API.editPage, { method: 'POST', body: fd });
      const data = await res.json();
      if (!data.success) {
        this.showEditError(data.message || 'Gagal menyimpan perubahan.');
        return;
      }
      this.books[state.bookIndex] = data.book;
      const fb = this.flipBooks[state.bookIndex];
      const leaf = state.leafType === 'cover' ? data.book.cover
        : state.leafType === 'back' ? data.book.backCover
        : data.book.content[state.contentIndex];
      if (fb) fb.applyEdit(state.leafType, state.contentIndex, leaf || {});
      this.closeEditModal();
    } catch (err) {
      console.error('[FlipBookScroll] Gagal menyimpan halaman:', err);
      this.showEditError('Gagal terhubung ke server. Coba lagi.');
    }
  }

  async submitAddPage(bookIndex, password) {
    const fd = new FormData();
    fd.append('bookIndex', String(bookIndex));
    fd.append('password', password);

    try {
      const res = await fetch(FLIPBOOK_API.addPage, { method: 'POST', body: fd });
      const data = await res.json();
      if (!data.success) {
        this.showEditError(data.message || 'Gagal menambah halaman.');
        return;
      }
      this.rebuildBook(bookIndex, data.book);
      this.closeEditModal();
    } catch (err) {
      console.error('[FlipBookScroll] Gagal menambah halaman:', err);
      this.showEditError('Gagal terhubung ke server. Coba lagi.');
    }
  }

  // FITUR HAPUS: hapus satu halaman isi. Jumlah halaman di buku itu
  // berubah -> sama kayak addPage, buku itu di-rebuild total (buku lain
  // gak disentuh).
  async submitDeletePage(bookIndex, contentIndex, password) {
    const fd = new FormData();
    fd.append('bookIndex', String(bookIndex));
    fd.append('contentIndex', String(contentIndex));
    fd.append('password', password);

    try {
      const res = await fetch(FLIPBOOK_API.deletePage, { method: 'POST', body: fd });
      const data = await res.json();
      if (!data.success) {
        this.showEditError(data.message || 'Gagal menghapus halaman.');
        return;
      }
      this.rebuildBook(bookIndex, data.book);
      this.closeEditModal();
    } catch (err) {
      console.error('[FlipBookScroll] Gagal menghapus halaman:', err);
      this.showEditError('Gagal terhubung ke server. Coba lagi.');
    }
  }

  // FITUR HAPUS: hapus satu buku UTUH. Jumlah buku (bukan cuma jumlah
  // halaman di 1 buku) yang berubah -> seluruh instance FlipBook perlu
  // dibongkar & dibangun ulang dari array buku terbaru (lihat
  // rebuildAll()), soalnya index semua buku SESUDAH buku yang dihapus
  // ikut geser.
  async submitDeleteBook(bookIndex, password) {
    const fd = new FormData();
    fd.append('bookIndex', String(bookIndex));
    fd.append('password', password);

    try {
      const res = await fetch(FLIPBOOK_API.deleteBook, { method: 'POST', body: fd });
      const data = await res.json();
      if (!data.success) {
        this.showEditError(data.message || 'Gagal menghapus buku.');
        return;
      }
      this.rebuildAll(data.books);
      this.closeEditModal();
    } catch (err) {
      console.error('[FlipBookScroll] Gagal menghapus buku:', err);
      this.showEditError('Gagal terhubung ke server. Coba lagi.');
    }
  }

  // FITUR EDIT: jumlah halaman berubah -> bongkar DOM buku itu aja, buku
  // lain gak disentuh, terus render ulang.
  rebuildBook(bookIndex, newBookData) {
    const old = this.flipBooks[bookIndex];
    if (old && old.root && old.root.parentNode) {
      old.root.parentNode.removeChild(old.root);
    }
    this.books[bookIndex] = newBookData;
    this.flipBooks[bookIndex] = this.makeFlipBook(newBookData, bookIndex);
    this.render();
  }

  // FITUR HAPUS: jumlah BUKU berubah -> bongkar SEMUA instance FlipBook
  // yang ada, bangun ulang total dari array buku terbaru (index-nya
  // udah pasti bener soalnya langsung dari response server, bukan hasil
  // splice manual di sisi client).
  rebuildAll(newBooksData) {
    this.flipBooks.forEach((fb) => {
      if (fb && fb.root && fb.root.parentNode) fb.root.parentNode.removeChild(fb.root);
    });

    this.books = newBooksData;
    this.container.style.height = `${this.books.length * this.segmentVh}vh`;

    this.dotsWrap.innerHTML = '';
    this.books.forEach(() => this.dotsWrap.appendChild(el('span', 'fb-dot')));

    this.flipBooks = this.books.map((book, i) => this.makeFlipBook(book, i));

    this.activeIndex = -1;
    // FITUR: daftar buku berubah total (ada yang kehapus, index geser) ->
    // tutup panel tombol aksi biar gak nyangkut ke buku yang udah gak
    // valid lagi.
    this.closeBookActions();
    this.recomputeBounds();
    this.progress = clamp01(this.progress);
    this.render();
  }

  addEvents() {
    this.onWheel = this.onWheel.bind(this);
    this.onTouchStart = this.onTouchStart.bind(this);
    this.onTouchMove = this.onTouchMove.bind(this);
    this.onKeydown = this.onKeydown.bind(this);
    this.onScroll = this.onScroll.bind(this);
    this.onResize = this.onResize.bind(this);
    this.onDocumentClick = this.onDocumentClick.bind(this);
    // FIX SCROLL: lihat onAnchorNavClick() di bawah.
    this.onAnchorNavClick = this.onAnchorNavClick.bind(this);

    window.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('touchstart', this.onTouchStart, { passive: true });
    window.addEventListener('touchmove', this.onTouchMove, { passive: false });
    window.addEventListener('keydown', this.onKeydown);
    window.addEventListener('scroll', this.onScroll, { passive: true });
    window.addEventListener('resize', this.onResize);
    // FITUR: klik di luar buku & di luar panel tombol aksi -> otomatis
    // nutup panel "Tambah Halaman"/"Hapus Buku Ini" kalau lagi kebuka.
    document.addEventListener('click', this.onDocumentClick);
    // FIX SCROLL: dipasang di fase capture (true) biar kedeteksi paling
    // awal, sebelum browser mulai animasi smooth-scroll bawaan dari klik
    // link anchor (mis. nav "Maps"/"Dokumen").
    document.addEventListener('click', this.onAnchorNavClick, true);

    if ('IntersectionObserver' in window) {
      this.observer = new IntersectionObserver(
        entries => {
          entries.forEach(entry => {
            this.inView = entry.isIntersecting;
          });
        },
        { rootMargin: '25% 0px 25% 0px' }
      );
      this.observer.observe(this.container);
    }
  }

  getDocumentTop(node) {
    let top = 0;
    let walker = node;
    while (walker) {
      top += walker.offsetTop;
      walker = walker.offsetParent;
    }
    return top;
  }

  recomputeBounds() {
    const vh = window.innerHeight;
    const top = this.getDocumentTop(this.container);
    const wrapHeight = this.container.offsetHeight;
    this.pinStart = top;
    this.pinEnd = top + Math.max(0, wrapHeight - vh);
    this.totalDistance = Math.max(1, this.pinEnd - this.pinStart);
  }

  engageLock(initialProgress, atY) {
    this.progress = clamp01(initialProgress);
    this.locked = true;
    this.lockBodyScroll(atY);
    this.scheduleRender();
  }

  releaseLock(direction) {
    this.recomputeBounds();
    this.locked = false;
    const target = direction > 0
      ? this.pinEnd + 2
      : Math.max(0, this.pinStart - 2);
    this.unlockBodyScroll(target);
  }

  lockBodyScroll(y) {
    this.savedScrollY = y;
    const scrollbarW = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${y}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    if (scrollbarW > 0) document.body.style.paddingRight = `${scrollbarW}px`;
  }

  unlockBodyScroll(targetY) {
    const htmlEl = document.documentElement;
    const prevScrollBehavior = htmlEl.style.scrollBehavior;
    htmlEl.style.scrollBehavior = 'auto';

    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    document.body.style.paddingRight = '';

    window.scrollTo(0, targetY);

    htmlEl.style.scrollBehavior = prevScrollBehavior;
    this.lastScrollY = targetY;
  }

  checkReentry() {
    if (this.locked) return;

    // FIX SCROLL: "Maps" nav macet di area flipbook.
    // Navigasi lewat anchor link (klik nav, mis. href="#map-section")
    // memicu smooth-scroll BAWAAN BROWSER yang tujuannya bisa aja di
    // BAWAH/LEWAT area buku ini. Kalau di tengah animasi itu posisi
    // scroll sempat singgah di dalam [pinStart, pinEnd], logic di bawah
    // bakal langsung "menangkap" & mengunci body (position:fixed) --
    // itu otomatis MEMBATALKAN animasi smooth-scroll bawaan browser,
    // jadi scroll-nya "macet" di buku dan gak pernah nyampe ke tujuan
    // aslinya. Selama suppressReentry aktif (dipasang oleh
    // onAnchorNavClick, dilepas oleh armSuppressRelease begitu scroll
    // benar-benar berhenti), reentry-lock ini dilewati dulu.
    if (this.suppressReentry) {
      this.lastScrollY = window.scrollY;
      return;
    }

    const y = window.scrollY;
    const prev = this.lastScrollY;
    this.lastScrollY = y;

    const insideRange = y >= this.pinStart && y <= this.pinEnd;

    if (insideRange) {
      let initialProgress;
      let lockAtStart = false;
      let lockAtEnd = false;

      if (prev === null) {
        initialProgress = clamp01((y - this.pinStart) / this.totalDistance);
      } else if (y < prev) {
        // User sedang SCROLL KE ATAS masuk ke area buku
        if (prev >= this.pinEnd - 10) {
          // FIX: buku terakhir sekarang gak pernah animasi keluar/fade
          // (lihat FlipBook.update(), this.isLast) -- dari local = EXIT_START
          // sampai local = 1 dia statis, tertutup, tetap 100% kelihatan.
          // Jadi progress = 1 (local = 1 persis buat buku terakhir) sekarang
          // AMAN dipakai sebagai titik kunci pas reentry dari bawah: gak
          // ada lagi resiko buku "sempet hilang dulu" kayak dulu, soalnya
          // local = 1 buat buku terakhir sekarang kelihatannya identik
          // sama local = EXIT_START (statis & full opacity, gak ke-hide).
          initialProgress = 1;
          lockAtEnd = true;
        } else {
          initialProgress = clamp01((y - this.pinStart) / this.totalDistance);
        }
      } else {
        // User sedang SCROLL KE BAWAH masuk ke area buku
        if (prev <= this.pinStart + 10) {
          initialProgress = 0; // Mulai dari buku pertama (0%)
          lockAtStart = true;
        } else {
          initialProgress = clamp01((y - this.pinStart) / this.totalDistance);
        }
      }

      const lockY = lockAtEnd ? this.pinEnd : (lockAtStart ? this.pinStart : y);
      this.engageLock(initialProgress, lockY);
      return;
    }

    // FIX SCROLL: flipbook "hilang" saat scroll balik ke atas dari
    // paling bawah.
    // Kalau lompatan antar-event scroll cukup jauh (scrollbar di-drag
    // cepat, fling/momentum kencang, tombol "scroll to top", dll),
    // posisi SEKARANG (y) bisa aja udah ada DI LUAR rentang pin padahal
    // posisi SEBELUMNYA (prev) ada di SISI YANG BERLAWANAN -- artinya
    // seluruh area buku ini "dilompati" dalam satu event scroll, tanpa
    // sempat ketangkep sama pengecekan insideRange di atas. Akibatnya
    // lock gak pernah nyala, dan buku gak pernah dirender ulang
    // (this.progress nyangkut di nilai terakhir -- biasanya ~1, alias
    // semua buku transparan/tersembunyi -- sampai user scroll ke bawah
    // lagi dan reentry dari pinStart mereset semuanya). Di sini kita cek
    // eksplisit kasus lompat itu, dan kunci di ujung yang sesuai arah
    // lompatannya, biar buku tetap muncul.
    if (prev !== null) {
      if (y < prev && prev > this.pinEnd && y < this.pinStart) {
        // Lompat sambil scroll ke ATAS -> kunci di progress=1 (ujung akhir),
        // buku terakhir muncul utuh & tertutup dulu (sama kayak reentry
        // normal -- lihat catatan FIX di atas soal kenapa progress=1 aman
        // dipakai sekarang buat buku terakhir).
        this.engageLock(1, this.pinEnd);
      } else if (y > prev && prev < this.pinStart && y > this.pinEnd) {
        // Lompat sambil scroll ke BAWAH -> kunci di ujung awal (pinStart),
        // buku pertama muncul dari awal.
        this.engageLock(0, this.pinStart);
      }
    }
  }

  onWheel(e) {
    if (this.editModalOpen) return;
    if (!this.locked) return;
    e.preventDefault();
    this.applyDelta(e.deltaY);
  }

  onTouchStart(e) {
    if (!e.touches || !e.touches.length) return;
    this.touchY = e.touches[0].clientY;
  }

  onTouchMove(e) {
    if (this.editModalOpen) return;
    if (!this.locked || !e.touches || e.touches.length > 1) return;
    const y = e.touches[0].clientY;
    const delta = this.touchY - y;
    this.touchY = y;
    if (!delta) return;
    e.preventDefault();
    this.applyDelta(delta);
  }

  onKeydown(e) {
    if (this.editModalOpen) {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.closeEditModal();
      }
      return;
    }

    if (!this.locked) return;

    const activeTag = document.activeElement && document.activeElement.tagName;
    if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') return;

    if (e.key === 'Home') { e.preventDefault(); this.progress = 0; this.scheduleRender(); return; }
    if (e.key === 'End') { e.preventDefault(); this.progress = 1; this.scheduleRender(); return; }

    const vh = window.innerHeight;
    let step = null;
    if (e.key === 'ArrowDown') step = 120;
    else if (e.key === 'ArrowUp') step = -120;
    else if (e.key === 'PageDown') step = vh;
    else if (e.key === 'PageUp') step = -vh;
    else if (e.key === ' ' || e.key === 'Spacebar') step = e.shiftKey ? -vh : vh;

    if (step === null) return;
    e.preventDefault();
    this.applyDelta(step);
  }

  onScroll() {
    if (this.locked) return;
    if (!this.inView) return;
    this.recomputeBounds();
    this.checkReentry();
  }

  onResize() {
    this.flipBooks.forEach(fb => fb.measure());
    this.recomputeBounds();
    if (this.locked) this.lockBodyScroll(this.savedScrollY);
    this.scheduleRender();
  }

  // FITUR: klik DI LUAR buku aktif & di luar panel tombol aksi (dan di
  // luar overlay modal edit, biar tombol Batal/Simpan di modal nggak
  // ikut nutup panel aksi di belakangnya) -> otomatis nutup panel
  // "Tambah Halaman"/"Hapus Buku Ini". Pola sama kayak overlay modal
  // yang nutup pas klik area gelap di luar .fb-edit-modal.
  onDocumentClick(e) {
    if (!this.actionsOpen) return;
    const insideBook = e.target.closest && e.target.closest('.fb-book');
    const insideActions = e.target.closest && e.target.closest('.fb-book-actions');
    const insideEditOverlay = e.target.closest && e.target.closest('.fb-edit-overlay');
    if (insideBook || insideActions || insideEditOverlay) return;
    this.closeBookActions();
  }

  // FIX SCROLL: "Maps" nav macet di area flipbook.
  // Klik anchor nav (href="#...") memicu smooth-scroll bawaan browser
  // yang tujuannya bisa aja di bawah/lewat area buku ini (contoh: dari
  // Hero ke #map-section, harus lewat #flipbook-section dulu). Reentry-
  // lock disuspend PERSIS dari saat link diklik (lihat checkReentry())
  // supaya animasi scroll bawaan browser itu gak pernah "ketangkep" &
  // dibatalin di tengah jalan. Dipasang di fase capture di addEvents()
  // biar kedeteksi sebelum browser mulai animasi.
  onAnchorNavClick(e) {
    const link = e.target.closest && e.target.closest('a[href^="#"]');
    if (!link) return;
    this.suppressReentry = true;
    this.armSuppressRelease();
  }

  // FIX SCROLL: melepas suppressReentry begitu posisi scroll beneran
  // berhenti bergerak (dicek tiap 120ms), lalu langsung evaluasi ulang
  // sekali lewat checkReentry() -- jadi kalau tujuan akhir navigasinya
  // kebetulan tetap di dalam area buku (mis. nav "Dokumen" yang menuju
  // pas ke awal section flipbook), buku tetap kekunci & kelihatan
  // seperti biasa tanpa perlu scroll tambahan. Dikasih batas waktu
  // maksimum 2 detik juga, biar gak nyangkut permanen kalau karena
  // sesuatu hal posisi scroll gak pernah "diam".
  armSuppressRelease() {
    if (this._suppressTimer) clearTimeout(this._suppressTimer);
    this._suppressLastY = window.scrollY;
    this._suppressStart = performance.now();

    const poll = () => {
      const settled = window.scrollY === this._suppressLastY;
      const timedOut = performance.now() - this._suppressStart > 2000;

      if (settled || timedOut) {
        this.suppressReentry = false;
        this._suppressTimer = null;
        this.recomputeBounds();
        this.checkReentry();
        return;
      }

      this._suppressLastY = window.scrollY;
      this._suppressTimer = setTimeout(poll, 120);
    };

    this._suppressTimer = setTimeout(poll, 120);
  }

  applyDelta(deltaY) {
    if (!deltaY) return;
    if (this.progress >= 1 && deltaY > 0) { this.releaseLock(1); return; }
    if (this.progress <= 0 && deltaY < 0) { this.releaseLock(-1); return; }
    this.progress = clamp01(this.progress + deltaY / this.totalDistance);
    this.scheduleRender();
  }

  scheduleRender() {
    if (this.renderTicking) return;
    this.renderTicking = true;
    requestAnimationFrame(() => {
      this.render();
      this.renderTicking = false;
    });
  }

  render() {
    const globalFloat = this.progress * this.books.length;

    this.flipBooks.forEach((fb, i) => {
      const local = clamp01(globalFloat - i);
      fb.update(local);
    });

    const activeIndex = Math.min(this.books.length - 1, Math.max(0, Math.floor(globalFloat + 1e-6)));
    if (this.activeIndex !== activeIndex) {
      this.activeIndex = activeIndex;
      this.caption.textContent = this.books[activeIndex].title || '';
      Array.from(this.dotsWrap.children).forEach((dot, i) => {
        dot.classList.toggle('on', i === activeIndex);
      });
      // FITUR: pindah ke buku lain (activeIndex berubah) -> otomatis
      // tutup panel "Tambah Halaman"/"Hapus Buku Ini" biar gak "nyangkut"
      // ke buku yang salah pas user geser scroll.
      this.closeBookActions();
    }

    // FITUR HAPUS: gak boleh hapus buku terakhir yang tersisa -- tombol
    // "Hapus Buku Ini" otomatis nonaktif kalau cuma sisa 1 buku.
    this.deleteBookBtn.disabled = this.books.length <= 1;
    this.deleteBookBtn.title = this.books.length <= 1
      ? 'Minimal harus ada 1 buku, tidak bisa dihapus semua.'
      : '';

    const activeBook = this.flipBooks[activeIndex];
    const revealBase = activeBook ? clamp01(activeBook.lastOpacity) : 1;
    const r = easeOutCubic(revealBase);
    this.caption.style.setProperty('--fb-reveal-o', String(r));
    this.caption.style.setProperty('--fb-reveal-y', `${(1 - r) * TEXT_REVEAL_RISE}px`);
  }

  /* ================================================================
     Navigasi terprogram ke buku tertentu -- DIPERLUAS: sekarang juga
     bisa loncat ke HALAMAN ISI tertentu di dalam buku, bukan cuma ke
     posisi "sampul buku" doang. Dipanggil dari js/AiChat.js maupun
     js/QRCodeRevealAnimation.js lewat window.__flipBookScrollInstance.

     index: 0 = buku pertama, 1 = kedua, 2 = ketiga, dst.
     pageNumber: OPSIONAL. Kalau null/undefined -> perilaku LAMA (buka
     ke posisi sampul depan, tertutup) -- ini yang dipakai
     QRCodeRevealAnimation.js, TIDAK BERUBAH SAMA SEKALI.
     Kalau diisi angka -> loncat ke halaman ISI itu (nomor sesuai label
     "Hal. 01/02/03" di kontennya). Kalau angkanya lebih besar dari
     jumlah halaman yang beneran ada, otomatis di-clamp ke halaman
     terakhir, dan hasil clamp itu dikembalikan lewat return value
     supaya pemanggil (AiChat.js) bisa kasih tau user.
     ================================================================ */
  goToBook(index, pageNumber) {
    const i = Math.max(0, Math.min(this.books.length - 1, index));
    const book = this.flipBooks[i];
    this.recomputeBounds();

    const reduceMotion = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Struktur leaf per buku: leaf 0 = sampul depan, leaf 1..N = halaman
    // isi (Hal. 01, 02, ...), leaf terakhir baliknya = sampul belakang.
    // Nomor halaman isi (1-based, sesuai label "Hal. 01/02/03") SAMA
    // PERSIS dengan index leaf-nya (leaf 0 udah kepakai sampul depan).
    // openLocal = leafIndex / n naruh leaf itu PAS di posisi "belum
    // kebalik" (front-nya nampang duluan, leaf sebelumnya baru aja
    // kebalik) -- itungannya konsisten sama logic per-halaman yang
    // sudah ada di FlipBook.update() (lihat variabel `t` di situ).
    let openLocal;
    let pageInfo = null;

    if (pageNumber == null) {
      // Perilaku LAMA, tidak diubah: buka ke posisi "buku baru masuk /
      // tertutup".
      openLocal = 0;
    } else {
      const n = book.pageCount;
      const maxPage = n - 1; // jumlah halaman isi yang beneran ada
      const clampedPage = Math.max(1, Math.min(maxPage, pageNumber));
      openLocal = clampedPage / n;
      pageInfo = {
        clampedToMax: clampedPage !== pageNumber,
        maxPage: maxPage,
        requestedPage: pageNumber
      };
    }

    const targetLocal = pageNumber == null
      ? Math.min(1, ENTER_END + 0.02)
      : ENTER_END + openLocal * (EXIT_START - ENTER_END);
    const targetProgress = clamp01((i + targetLocal) / this.books.length);

    const settle = () => {
      this.progress = targetProgress;
      this.render();
    };

    const beginTween = () => {
      if (reduceMotion) { settle(); return; }
      const from = this.progress;
      const to = targetProgress;
      const duration = 900;
      const start = performance.now();

      const step = (now) => {
        const t = clamp01((now - start) / duration);
        this.progress = lerp(from, to, easeOutCubic(t));
        this.render();
        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          settle();
        }
      };
      requestAnimationFrame(step);
    };

    if (this.locked) {
      beginTween();
      return pageInfo;
    }

    window.scrollTo({ top: this.pinStart, behavior: reduceMotion ? 'auto' : 'smooth' });

    const pollStart = performance.now();
    const poll = () => {
      if (this.locked) { beginTween(); return; }
      if (performance.now() - pollStart > 2000) {
        this.engageLock(0, this.pinStart);
        beginTween();
        return;
      }
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);

    return pageInfo;
  }

  destroy() {
    window.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('touchstart', this.onTouchStart);
    window.removeEventListener('touchmove', this.onTouchMove);
    window.removeEventListener('keydown', this.onKeydown);
    window.removeEventListener('scroll', this.onScroll);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('click', this.onDocumentClick);
    document.removeEventListener('click', this.onAnchorNavClick, true);
    if (this._suppressTimer) clearTimeout(this._suppressTimer);
    if (this.observer) this.observer.disconnect();
    if (this.locked) this.unlockBodyScroll(this.savedScrollY);
    if (this.editOverlay && this.editOverlay.parentNode) {
      this.editOverlay.parentNode.removeChild(this.editOverlay);
    }
  }
}

// FITUR EDIT: ambil data buku dari backend (routes/flipbookContent.js).
// Kalau gagal (server down / belum di-deploy route-nya / offline), balik
// null biar caller fallback ke DEFAULT_BOOKS / config.books kayak biasa.
async function fetchFlipbookContent() {
  try {
    const res = await fetch(FLIPBOOK_API.content);
    if (!res.ok) throw new Error('bad status ' + res.status);
    const data = await res.json();
    if (data && data.success && Array.isArray(data.books) && data.books.length) {
      return data.books;
    }
  } catch (err) {
    console.warn('[FlipBookScroll] Gagal memuat konten dari server, pakai data bawaan:', err);
  }
  return null;
}

async function init() {
  const container = document.getElementById('flipbookContainer');
  if (!container) return;

  const loadingEl = el('div', 'fb-loading');
  loadingEl.textContent = 'Memuat konten...';
  container.appendChild(loadingEl);

  const config = window.FlipBookScrollConfig || {};
  const serverBooks = await fetchFlipbookContent();

  if (loadingEl.parentNode) loadingEl.parentNode.removeChild(loadingEl);

  const finalConfig = Object.assign({}, config, { books: serverBooks || config.books });
  window.__flipBookScrollInstance = new FlipBookScroll(container, finalConfig);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}