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

function buildCoverFace(data) {
  const face = el('div', 'fb-page-face fb-face-cover');
  const reveal = el('div', 'fb-reveal');
  reveal.appendChild(text('p', 'fb-kicker', data.kicker));
  reveal.appendChild(text('h3', 'fb-cover-heading', data.heading));
  face.appendChild(reveal);
  return { el: face, reveal };
}

function buildTextFace(data) {
  const face = el('div', 'fb-page-face fb-face-text');
  const reveal = el('div', 'fb-reveal');
  reveal.appendChild(text('p', 'fb-page-num', data.page ? `Hal. ${data.page}` : ''));
  reveal.appendChild(text('h4', 'fb-page-heading', data.heading));
  reveal.appendChild(text('p', 'fb-page-body', data.body));
  face.appendChild(reveal);
  return { el: face, reveal };
}

function buildBackFace(data) {
  const face = el('div', 'fb-page-face fb-face-back');
  const reveal = el('div', 'fb-reveal');
  reveal.appendChild(text('h4', 'fb-back-heading', data.heading));
  reveal.appendChild(text('p', 'fb-back-tagline', data.tagline));
  face.appendChild(reveal);
  return { el: face, reveal };
}

function buildBlankFace() {
  return { el: el('div', 'fb-page-face fb-face-blank'), reveal: null };
}

function buildFace(entry) {
  if (entry.kind === 'cover') return buildCoverFace(entry);
  if (entry.kind === 'back') return buildBackFace(entry);
  if (entry.kind === 'blank') return buildBlankFace();
  return buildTextFace(entry);
}

function openScaleBump(spreadT) {
  return 1 + OPEN_SCALE_BUMP * spreadT;
}

class FlipBook {
  constructor(stage, book, index) {
    this.index = index;

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

    this.shadow = el('div', 'fb-shadow');
    this.root.appendChild(this.shadow);

    this.pageEls = [];
    leaves.forEach((leafData, p) => {
      const page = el('div', 'fb-page');

      const frontBuilt = buildFace(leafData);
      const front = frontBuilt.el;
      front.classList.add('fb-page-front');

      const isLast = p === leaves.length - 1;
      const backBuilt = buildFace(isLast ? backData : { kind: 'blank' });
      const back = backBuilt.el;
      back.classList.add('fb-page-back');

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
      const t = easeInCubic(clamp01((local - EXIT_START) / (1 - EXIT_START)));
      xOffset = lerp(0, this.exitSide * this.travelPx, t);
      rot = lerp(0, this.exitSide * -SIDE_ROT, t);
      scale = lerp(1, 0.7, t);
      opacity = 1 - t;
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

    if (opacity <= 0.001 || local <= 0 || local >= 1) {
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

    this.flipBooks = this.books.map((book, i) => new FlipBook(this.stage, book, i));
  }

  addEvents() {
    this.onWheel = this.onWheel.bind(this);
    this.onTouchStart = this.onTouchStart.bind(this);
    this.onTouchMove = this.onTouchMove.bind(this);
    this.onKeydown = this.onKeydown.bind(this);
    this.onScroll = this.onScroll.bind(this);
    this.onResize = this.onResize.bind(this);

    window.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('touchstart', this.onTouchStart, { passive: true });
    window.addEventListener('touchmove', this.onTouchMove, { passive: false });
    window.addEventListener('keydown', this.onKeydown);
    window.addEventListener('scroll', this.onScroll, { passive: true });
    window.addEventListener('resize', this.onResize);

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
    const y = window.scrollY;

    // Jika posisi scroll di luar rentang container buku, hiraukan
    if (y < this.pinStart || y > this.pinEnd) {
      this.lastScrollY = y;
      return;
    }

    const prev = this.lastScrollY;
    this.lastScrollY = y;

    let initialProgress;

    if (prev === null) {
      initialProgress = clamp01((y - this.pinStart) / this.totalDistance);
    } else if (y < prev) {
      // User sedang SCROLL KE ATAS masuk ke area buku
      if (prev >= this.pinEnd - 10) {
        initialProgress = 1; // Mulai dari buku terakhir (100%)
      } else {
        initialProgress = clamp01((y - this.pinStart) / this.totalDistance);
      }
    } else {
      // User sedang SCROLL KE BAWAH masuk ke area buku
      if (prev <= this.pinStart + 10) {
        initialProgress = 0; // Mulai dari buku pertama (0%)
      } else {
        initialProgress = clamp01((y - this.pinStart) / this.totalDistance);
      }
    }

    const lockY = initialProgress === 1 ? this.pinEnd : (initialProgress === 0 ? this.pinStart : y);
    this.engageLock(initialProgress, lockY);
  }

  onWheel(e) {
    if (!this.locked) return;
    e.preventDefault();
    this.applyDelta(e.deltaY);
  }

  onTouchStart(e) {
    if (!e.touches || !e.touches.length) return;
    this.touchY = e.touches[0].clientY;
  }

  onTouchMove(e) {
    if (!this.locked || !e.touches || e.touches.length > 1) return;
    const y = e.touches[0].clientY;
    const delta = this.touchY - y;
    this.touchY = y;
    if (!delta) return;
    e.preventDefault();
    this.applyDelta(delta);
  }

  onKeydown(e) {
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
    }

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
    if (this.observer) this.observer.disconnect();
    if (this.locked) this.unlockBodyScroll(this.savedScrollY);
  }
}

function init() {
  const container = document.getElementById('flipbookContainer');
  if (!container) return;
  const config = window.FlipBookScrollConfig || {};
  window.__flipBookScrollInstance = new FlipBookScroll(container, config);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}