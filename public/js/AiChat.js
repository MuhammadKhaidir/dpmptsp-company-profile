// AiChat.js
// Panel chat AI di landing page.
// PENTING: file ini TIDAK PERNAH menyimpan/menerima API key OpenRouter.
// Semua request AI dikirim ke '/api/chat' (backend sendiri, same-origin),
// dan backend-lah (server.js + web.js) yang menyimpan key di .env & memanggil OpenRouter.
// Dengan begini, DevTools Network tab cuma akan menampilkan request ke domain
// sendiri berisi { messages: [...] } dan balasan { reply: "..." } — key tidak pernah terlihat.
//
// BARU: fitur "ganti gambar/judul QR lewat chat" (lihat blok KARTU EDIT QR VIA
// CHAT di bawah) sekarang digerbang status admin (isAdmin, dicek lewat
// /api/auth/check-session) -- BUKAN kata sandi manual lagi. Otorisasi
// sebenarnya tetap ditegakkan di server lewat middleware/requireAdmin.js
// (lihat routes/qrImages.js), jadi walau ada yang coba panggil endpoint
// langsung tanpa lewat kartu ini, tetap ditolak kalau bukan admin yang login.
// Berkas gambar yang diunggah TIDAK PERNAH dikirim ke /api/chat atau ikut ke
// chatHistory -- cuma dikirim langsung ke endpoint backend sendiri
// '/api/qr-images/:slot' (same-origin), persis seperti modal "Perbarui
// Gambar" di panel QR (lihat js/QRCodeRevealAnimation.js).
//
// BARU: situs ini sekarang login KHUSUS ADMIN -- pendaftaran akun publik
// dan fitur pengaduan/laporan (beserta dashboard masyarakat/petugas/admin
// yang menyertainya) SUDAH TIDAK ADA lagi. Makanya NAV target REGISTER,
// DASHBOARD_MASYARAKAT, DASHBOARD_PETUGAS, DASHBOARD_ADMIN, dan FORM_LAPORAN
// sudah dilepas dari handleNavigation() di bawah -- kalau AI somehow masih
// pernah mengirim salah satu tag itu, target-nya sekarang diam-diam
// diabaikan, bukan memicu modal/halaman yang sudah tidak berfungsi.

let chatHistory = [];
let aiTyping = false;

// Gambar yang barusan dilampirkan user lewat tombol klip di composer, nunggu
// dipakai buat kartu edit QR. Cuma hidup di memori tab ini, gak pernah
// disimpan ke chatHistory ataupun dikirim ke /api/chat.
let pendingAttachment = null;

// BARU: status admin, dicek dari /api/auth/check-session (endpoint yang
// sudah ada di routes/auth.js) -- dipakai buat nge-gate kartu edit QR di
// chat ini, sejalan sama gerbang admin yang sama di
// js/QRCodeRevealAnimation.js. Pengguna biasa (bukan admin / belum login)
// gak akan pernah dikasih lihat kartu edit ini sama sekali.
let isAdmin = false;

function loadAdminStatus() {
  return fetch('/api/auth/check-session')
    .then(res => res.ok ? res.json() : null)
    .then(data => {
      isAdmin = !!(data && data.logged_in && data.role === 'admin');
    })
    .catch(() => {
      isAdmin = false;
    });
}

const FLIPBOOK_API_BASE = '/api/flipbook-content'; // cek lagi mount path-nya di server.js/web.js

function fetchFlipbookBooks() {
  return fetch(FLIPBOOK_API_BASE + '/content')
    .then(res => res.ok ? res.json() : null)
    .then(data => (data && data.success) ? data.books : null)
    .catch(() => null);
}

function buildFlipbookEditCardElement(bookIndex, leaf, currentBook) {
  const wrap = document.createElement('div');
  wrap.className = 'msg-ai chat-qr-card-wrap'; // reuse CSS kartu QR, gak perlu style baru

  const bookTitle = FLIPBOOK_TITLES[bookIndex] || currentBook.title || ('Buku ke-' + (bookIndex + 1));
  const leafLabel = flipbookLeafLabel(leaf);

  let leafData = {};
  if (leaf.leafType === 'cover') leafData = currentBook.cover || {};
  else if (leaf.leafType === 'back') leafData = currentBook.backCover || {};
  else leafData = currentBook.content[leaf.contentIndex] || {};

  let fieldsHtml = '';
  if (leaf.leafType === 'cover') {
    fieldsHtml =
      '<label class="chat-qr-card-label">Kicker (label kecil di atas judul)' +
        '<input type="text" class="chat-qr-card-input" data-field="kicker" value="' + escapeAttr(leafData.kicker || '') + '">' +
      '</label>' +
      '<label class="chat-qr-card-label">Judul Sampul' +
        '<input type="text" class="chat-qr-card-input" data-field="heading" value="' + escapeAttr(leafData.heading || '') + '">' +
      '</label>';
  } else if (leaf.leafType === 'back') {
    fieldsHtml =
      '<label class="chat-qr-card-label">Judul Sampul Belakang' +
        '<input type="text" class="chat-qr-card-input" data-field="heading" value="' + escapeAttr(leafData.heading || '') + '">' +
      '</label>' +
      '<label class="chat-qr-card-label">Tagline' +
        '<input type="text" class="chat-qr-card-input" data-field="tagline" value="' + escapeAttr(leafData.tagline || '') + '">' +
      '</label>';
  } else {
    fieldsHtml =
      '<label class="chat-qr-card-label">Judul Halaman' +
        '<input type="text" class="chat-qr-card-input" data-field="heading" value="' + escapeAttr(leafData.heading || '') + '">' +
      '</label>' +
      '<label class="chat-qr-card-label">Isi Tulisan' +
        '<textarea class="chat-qr-card-input" data-field="body" rows="4">' + escapeHtml(leafData.body || '') + '</textarea>' +
      '</label>';
  }

  wrap.innerHTML =
    '<div class="msg-ai-avatar"><i class="fa-solid fa-robot" style="font-size:10px;"></i></div>' +
    '<div class="chat-qr-card">' +
        '<div class="chat-qr-card-title">Edit Buku "' + escapeHtml(bookTitle) + '" — ' + escapeHtml(leafLabel) + '</div>' +
        '<p class="chat-qr-card-sub">Kosongkan kolom yang gak mau diubah.</p>' +
        fieldsHtml +
        '<label class="chat-qr-card-label">Gambar Baru (opsional — PNG/JPG/WEBP/GIF, maks 4MB)' +
            '<input type="file" class="chat-qr-card-input" data-field="image" accept="image/png,image/jpeg,image/webp,image/gif">' +
        '</label>' +
        '<p class="chat-qr-card-file-note" data-qr-card-file-note style="display:none;"></p>' +
        '<p class="chat-qr-card-error" data-qr-card-error style="display:none;"></p>' +
        '<div class="chat-qr-card-actions">' +
            '<button type="button" class="chat-qr-card-btn chat-qr-card-btn-ghost" data-action="cancel">Batal</button>' +
            '<button type="button" class="chat-qr-card-btn chat-qr-card-btn-primary" data-action="submit"><i class="fa-solid fa-upload"></i> Simpan</button>' +
        '</div>' +
    '</div>';

  return wrap;
}

function openFlipbookEditCard(bookIndex, leaf) {
  const box = document.getElementById('chat-messages-box');
  if (!box) return;

  fetchFlipbookBooks().then(books => {
    const currentBook = books && books[bookIndex];
    if (!currentBook) {
      pushAIMessage('Gagal ambil data buku dari server, coba lagi ya.', QUICK_CHIPS_EXPLORE);
      return;
    }
    if (leaf.leafType === 'content' && !currentBook.content[leaf.contentIndex]) {
      pushAIMessage('Halaman itu gak ada -- buku ini cuma punya ' + currentBook.content.length + ' halaman isi.', QUICK_CHIPS_EXPLORE);
      return;
    }

    const card = buildFlipbookEditCardElement(bookIndex, leaf, currentBook);
    box.appendChild(card);
    scrollChat();
    wireFlipbookEditCard(card, bookIndex, leaf, currentBook);
  });
}

function wireFlipbookEditCard(card, bookIndex, leaf, currentBook) {
  const fileInput = card.querySelector('[data-field="image"]');
  const fileNote = card.querySelector('[data-qr-card-file-note]');
  const errorEl = card.querySelector('[data-qr-card-error]');
  const cancelBtn = card.querySelector('[data-action="cancel"]');
  const submitBtn = card.querySelector('[data-action="submit"]');
  const bookTitle = FLIPBOOK_TITLES[bookIndex] || currentBook.title;

  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files[0]) {
      fileNote.textContent = 'Gambar terlampir: ' + fileInput.files[0].name;
      fileNote.style.display = 'block';
    } else {
      fileNote.style.display = 'none';
    }
  });

  cancelBtn.addEventListener('click', () => {
    card.remove();
    pushAIMessage('Oke, gak jadi diubah ya.', QUICK_CHIPS_EXPLORE);
  });

  submitBtn.addEventListener('click', () => {
    errorEl.style.display = 'none';

    const formData = new FormData();
    formData.append('bookIndex', String(bookIndex));
    formData.append('leafType', leaf.leafType);
    if (leaf.leafType === 'content') formData.append('contentIndex', String(leaf.contentIndex));

    card.querySelectorAll('[data-field]').forEach((el) => {
      const field = el.dataset.field;
      if (field === 'image') return;
      const val = el.value.trim();
      if (val) formData.append(field, val);
    });

    const file = fileInput.files && fileInput.files[0];
    if (file) formData.append('image', file);

    submitBtn.disabled = true;
    cancelBtn.disabled = true;
    submitBtn.innerHTML = 'Menyimpan...';

    fetch(FLIPBOOK_API_BASE + '/page', {
      method: 'POST',
      body: formData,
      credentials: 'same-origin'
    })
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(result => {
        if (!result.ok || !result.data.success) {
          throw new Error(result.data.message || 'Gagal menyimpan perubahan.');
        }
        card.remove();
        pushAIMessage('Sip, "' + flipbookLeafLabel(leaf) + '" di buku "' + bookTitle + '" berhasil diperbarui! Refresh halaman ini biar tampilan bukunya keupdate ya.', QUICK_CHIPS_EXPLORE);
      })
      .catch(err => {
        errorEl.textContent = err.message || 'Terjadi kesalahan yang tidak diketahui.';
        errorEl.style.display = 'block';
        submitBtn.disabled = false;
        cancelBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-upload"></i> Simpan';
      });
  });
}

const QUICK_CHIPS_DEFAULT = ["Ke Buku Sejarah & Latar Belakang", "Scan Katalog Investasi", "Masuk ke Sistem", "Lihat Company Profile"];

/* ==========================================================================
   BARU: SISTEM NAVIGASI LOKAL (client-side), TANPA PERLU LEWAT AI BACKEND
   ==========================================================================
   Kenapa ini ada: backend (yang manggil OpenRouter) itu "otak" AI-nya, dan
   kita gak punya akses ke system prompt-nya dari sini -- jadi AI itu sendiri
   BELUM tau soal fitur eksplorasi baru (buku, halaman, kartu carousel, dst).
   Daripada nunggu backend di-update, sistem di bawah ini baca kata kunci +
   kata kerja perintah LANGSUNG dari pesan yang diketik user, dan kalau
   cocok, LANGSUNG eksekusi aksinya (scroll/loncat/dsb) tanpa nunggu balesan
   AI sama sekali -- makanya kerasa instan.

   Untuk aksi yang emang udah dipegang backend (login), SENGAJA TIDAK
   di-intercept di sini -- itu tetep lewat jalur AI seperti biasa (lihat
   handleNavigation di bawah), soalnya itu udah teruji jalan dan gak ada
   hubungannya sama fitur baru ini.
   ========================================================================== */

// Kata kerja perintah -- navigasi CUMA jalan kalau salah satu kata ini ada.
// Ini WAJIB, biar kalimat kayak "eh katalog investasi itu isinya apaan sih"
// (yang cuma NYEBUT nama, bukan MINTA dianter ke sana) tetep lanjut ke AI
// buat dijawab ngobrol biasa, bukan keliru di-treat sebagai perintah pindah.
const ACTION_VERBS = /\b(ke|buka|bukakan|tampilkan|tunjukkan|tunjukin|pergi|loncat|lompat|geser|arahkan|arahin|bawa|pindah|pindahkan|scroll|gulir|lihatin|liatin|lihat|cek|scan|pindai)\b/;

const FLIPBOOK_TITLES = ['Sejarah & Latar Belakang', 'Visi & Misi', 'Struktur & Layanan'];
const CAROUSEL_TITLES = ['Pelayanan Terpadu', 'Transparan & Akuntabel', 'Responsif', 'Visi', 'Misi'];

const SECTION_IDS = {
  hero: 'hero',
  profil: 'profil-section',
  qr: 'qr-section',
  flipbook: 'flipbook-section'
};
const SECTION_LABELS = {
  hero: 'Beranda',
  profil: 'Profil, Visi & Misi',
  qr: 'Scan QR / Katalog Investasi',
  flipbook: 'Company Profile (Flipbook)'
};

function matchPageNumber(t) {
  const m = t.match(/hal(?:aman)?\.?\s*(\d+)/) || t.match(/\bpage\s*(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function matchBookIndex(t) {
  // Prioritas: nomor eksplisit ("buku 1/2/3", "pertama/kedua/ketiga") dulu,
  // baru lanjut ke judul/topik buku, baru lanjut ke alias nama kotak QR
  // (karena tiap kotak QR memang mewakili satu buku yang sama).
  if (/\bbuku\s*(1|satu|pertama)\b/.test(t)) return 0;
  if (/\bbuku\s*(2|dua|kedua)\b/.test(t)) return 1;
  if (/\bbuku\s*(3|tiga|ketiga)\b/.test(t)) return 2;

  if (/sejarah|latar belakang/.test(t)) return 0;
  if (t.includes('visi') && t.includes('misi')) return 1;
  if (/struktur.*layanan|layanan.*struktur/.test(t)) return 2;

  if (/peluang bisnis|peluang investasi/.test(t)) return 0;
  if (/katalog/.test(t)) return 1;
  if (/profil investasi/.test(t)) return 2;

  if (/qr\s*(kiri|pertama|satu|1)\b|kotak\s*(kiri|pertama|satu|1)\b/.test(t)) return 0;
  if (/qr\s*(tengah|kedua|dua|2)\b|kotak\s*(tengah|kedua|dua|2)\b/.test(t)) return 1;
  if (/qr\s*(kanan|ketiga|tiga|3)\b|kotak\s*(kanan|ketiga|tiga|3)\b/.test(t)) return 2;

  return null;
}

function matchCarouselCard(t) {
  // WAJIB ada kata "kartu"/"card" biar gak bentrok sama matchBookIndex
  // (misal "visi" & "misi" dipakai juga buat nama buku ke-2).
  if (!/\bkartu\b|\bcard\b/.test(t)) return null;
  if (/pelayanan/.test(t)) return 0;
  if (/transparan|akuntabel/.test(t)) return 1;
  if (/responsif/.test(t)) return 2;
  if (/visi/.test(t) && !t.includes('misi')) return 3;
  if (/misi/.test(t) && !t.includes('visi')) return 4;
  return null;
}

function runSectionAction(key) {
  const id = SECTION_IDS[key];
  const label = SECTION_LABELS[key];
  const el = id && document.getElementById(id);
  if (!el) return null;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return `Oke, aku bawa kamu ke bagian ${label} ya.`;
}

function runBookAction(bookIndex, pageNumber) {
  const inst = window.__flipBookScrollInstance;
  const bookTitle = FLIPBOOK_TITLES[bookIndex] || `buku ke-${bookIndex + 1}`;

  if (!inst || typeof inst.goToBook !== 'function') {
    const fb = document.getElementById('flipbook-section');
    if (fb) fb.scrollIntoView({ behavior: 'smooth' });
    return `Oke, aku arahkan ke bagian flipbook dulu ya (belum bisa loncat presisi ke buku "${bookTitle}", coba lagi bentar).`;
  }

  const result = inst.goToBook(bookIndex, pageNumber);

  if (pageNumber == null) {
    return `Sip, meluncur ke buku "${bookTitle}" ya!`;
  }
  if (result && result.clampedToMax) {
    return `Buku "${bookTitle}" cuma sampai halaman ${result.maxPage} nih, jadi aku bawa kamu ke halaman terakhirnya ya.`;
  }
  return `Sip, meluncur ke buku "${bookTitle}" halaman ${pageNumber} ya!`;
}

function runCarouselAction(cardIndex) {
  const cardTitle = CAROUSEL_TITLES[cardIndex] || `kartu ke-${cardIndex + 1}`;
  const section = document.getElementById('profil-section');
  if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const root = document.querySelector('[data-arc-carousel]');
  const inst = root && root.__arcCarouselInstance;
  if (inst && typeof inst.goTo === 'function') {
    // Jeda dikit biar scroll ke section kelar duluan sebelum carousel-nya
    // diputar -- kalau dipanggil bareng, kartunya bisa keputer padahal
    // section-nya masih di tengah proses scroll masuk viewport.
    setTimeout(() => inst.goTo(cardIndex), 600);
    return `Oke, aku bawa ke bagian Profil, Visi & Misi dan geser ke kartu "${cardTitle}" ya!`;
  }
  return `Oke, aku bawa ke bagian Profil, Visi & Misi ya (kartu "${cardTitle}" ada di carousel situ).`;
}

function detectAndExecuteLocalAction(rawText) {
  const t = rawText.toLowerCase();

  if (!ACTION_VERBS.test(t)) return null;

  const pageNumber = matchPageNumber(t);

  const bookIndex = matchBookIndex(t);
  if (bookIndex !== null) {
    return runBookAction(bookIndex, pageNumber);
  }

  const cardIndex = matchCarouselCard(t);
  if (cardIndex !== null) {
    return runCarouselAction(cardIndex);
  }

  if (/\bqr\b|scan|pindai/.test(t)) return runSectionAction('qr');
  if (/flipbook|company profile|\bdokumen\b/.test(t)) return runSectionAction('flipbook');
  if (/\bprofil\b/.test(t)) return runSectionAction('profil');
  if (/beranda|awal|\bhero\b/.test(t)) return runSectionAction('hero');

  return null;
}

/* ==========================================================================
   BARU: DETEKSI NIAT "GANTI GAMBAR / JUDUL QR" LEWAT CHAT
   ==========================================================================
   Kata kerjanya SENGAJA beda dari ACTION_VERBS di atas (ganti/ubah/update/dst,
   bukan ke/buka/tunjukkan/dst), jadi gak akan pernah tabrakan sama sistem
   navigasi lokal -- keduanya dicek terpisah di sendChatMessageText().

   Kalau niat ini kedetek DAN yang chat adalah admin yang sedang login, kita
   SAMA SEKALI TIDAK memanggil AI backend. Yang muncul adalah kartu form
   inline (lihat openQrEditCard) -- ini jadi jaminan keamanan tambahan:
   fitur ini gak bisa "ke-trigger" otomatis oleh AI atau oleh isi pesan
   orang lain, dan gak akan pernah ditampilkan ke pengguna yang bukan admin.
   ========================================================================== */

const QR_EDIT_VERBS = /\b(ganti|gantikan|mengganti|ubah|ubahin|mengubah|update|perbarui|memperbarui|perbaharui|rubah|edit|pakai|gunakan|pasang|pasangkan)\b/;
const QR_EDIT_TARGETS = /\b(background|bg|gambar|foto|qr|kode\s*qr|judul|caption|nama\s*kotak)\b/;
const FLIPBOOK_EDIT_TARGETS = /\b(buku|halaman|sampul|cover)\b/;

function matchFlipbookLeaf(t) {
  if (/sampul\s*depan|cover\s*depan|halaman\s*depan/.test(t)) return { leafType: 'cover' };
  if (/sampul\s*belakang|cover\s*belakang|halaman\s*belakang/.test(t)) return { leafType: 'back' };
  const pageNumber = matchPageNumber(t); // reuse fungsi yang udah ada
  if (pageNumber != null) return { leafType: 'content', contentIndex: pageNumber - 1 };
  return null; // ambigu -- belum jelas bagian mana
}

function detectFlipbookEditIntent(rawText) {
  const t = rawText.toLowerCase();
  if (!QR_EDIT_VERBS.test(t)) return null; // reuse verb list yang sama kayak QR edit
  if (!FLIPBOOK_EDIT_TARGETS.test(t)) return null;
  return {
    bookIndex: matchBookIndex(t), // reuse, bisa null
    leaf: matchFlipbookLeaf(t)     // bisa null kalau ambigu
  };
}

function flipbookLeafLabel(leaf) {
  if (leaf.leafType === 'cover') return 'Sampul Depan';
  if (leaf.leafType === 'back') return 'Sampul Belakang';
  return 'Halaman ' + String(leaf.contentIndex + 1).padStart(2, '0');
}


function matchQrSlot(t) {
  // Alias yang sama kayak yang dipakai buat kenalin buku/kotak QR di
  // matchBookIndex, tapi hasilnya langsung berupa nama slot ('left' /
  // 'center' / 'right') soalnya itu yang dipakai endpoint qr-images.
  if (/\bbuku\s*(1|satu|pertama)\b/.test(t)) return 'left';
  if (/\bbuku\s*(2|dua|kedua)\b/.test(t)) return 'center';
  if (/\bbuku\s*(3|tiga|ketiga)\b/.test(t)) return 'right';

  if (/sejarah|latar belakang/.test(t)) return 'left';
  if (t.includes('visi') && t.includes('misi')) return 'center';
  if (/struktur.*layanan|layanan.*struktur/.test(t)) return 'right';

  if (/peluang bisnis|peluang investasi/.test(t)) return 'left';
  if (/katalog/.test(t)) return 'center';
  if (/profil investasi/.test(t)) return 'right';

  if (/qr\s*(kiri|pertama|satu|1)\b|kotak\s*(kiri|pertama|satu|1)\b/.test(t)) return 'left';
  if (/qr\s*(tengah|kedua|dua|2)\b|kotak\s*(tengah|kedua|dua|2)\b/.test(t)) return 'center';
  if (/qr\s*(kanan|ketiga|tiga|3)\b|kotak\s*(kanan|ketiga|tiga|3)\b/.test(t)) return 'right';

  return null;
}

function detectQrEditIntent(rawText) {
  const t = rawText.toLowerCase();
  const hasVerb = QR_EDIT_VERBS.test(t);
  const hasTarget = QR_EDIT_TARGETS.test(t);

  if (pendingAttachment) {
    // Ada gambar yang barusan dilampirkan lewat tombol klip -- lampiran
    // itu sendiri udah cukup jadi sinyal niat "ganti gambar QR", jadi kita
    // longgarkan syaratnya: cukup salah satu (kata kerja ATAU target ATAU
    // langsung kesebut nama kotaknya) buat nganggep ini niat ganti QR.
    const slotFromText = matchQrSlot(t);
    if (slotFromText || hasVerb || hasTarget) {
      return { slot: slotFromText };
    }
    return null;
  }

  if (!hasVerb || !hasTarget) return null;
  return { slot: matchQrSlot(t) };
}

// Dipakai buat nge-refresh tampilan panel QR di halaman ini setelah kartu
// chat berhasil nyimpen perubahan (gambar dan/atau judul). Sengaja dibikin
// mandiri di sini (gak manggil fungsi dari QRCodeRevealAnimation.js) biar
// AiChat.js gak bergantung ke internal file lain yang IIFE-nya tertutup.
function applyQrUpdateToPage(slot, entry) {
  const panel = document.getElementById('qr-panel');
  if (!panel) return;

  const box = panel.querySelector('.qr-panel-' + slot);
  if (box) {
    if (entry && entry.url) {
      const img = box.querySelector('.qr-img');
      if (img) {
        const v = entry.updatedAt || Date.now();
        img.src = '/api/qr-images/file/' + slot + '?v=' + v;
      }
    }
    if (entry && entry.title) {
      const caption = box.querySelector('.qr-caption');
      if (caption) caption.textContent = entry.title;
    }
  }

  if (entry && entry.title) {
    const hoverHeading = panel.querySelector('.qr-hover-text-' + slot + ' .qr-hover-text-inner h4');
    if (hoverHeading) hoverHeading.textContent = entry.title;
  }
}

// escapeHtml biasa (di bawah) aman buat teks bubble, tapi gak aman kalau
// ditaro di dalam atribut kayak value="..." (tanda kutip gak ke-escape).
// escapeAttr ini khusus buat kasus itu -- dipakai pas nyusun kartu edit QR.
function escapeAttr(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, function (ch) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
  });
}

const QUICK_CHIPS_EXPLORE = ["Ke Buku Visi & Misi", "Ke Buku Struktur & Layanan", "Kembali ke Beranda", "Scan Kode QR"];

function initAIChat() {
  chatHistory = [];
  renderMessages([]);
  renderChips(QUICK_CHIPS_DEFAULT);
  setupChatAttachments();
  clearPendingAttachment();
  syncSlotLabelsFromMeta();
  loadAdminStatus();
  setTimeout(() => {
    pushAIMessage(
      "Halo! Selamat datang di DPMPTSP Kota Palembang. Aku bisa langsung anter kamu ke bagian mana pun di halaman ini — misalnya \"buka buku Visi & Misi halaman 2\" atau \"scan QR Katalog Investasi\". Kalau kamu admin yang sudah login, kamu juga bisa minta aku ganti gambar/judul kotak QR langsung dari sini, tinggal bilang mis. \"ganti background Katalog Investasi\". Mau ke mana dulu?",
      QUICK_CHIPS_DEFAULT
    );
  }, 400);
}

// Ambil judul kotak QR terbaru dari server (kalau pernah diganti lewat modal
// panel QR ataupun lewat chat sebelumnya) supaya kartu edit di chat nampilin
// judul yang beneran aktif, bukan judul default hardcode.
function syncSlotLabelsFromMeta() {
  fetch('/api/qr-images/meta')
    .then(res => res.ok ? res.json() : null)
    .then(data => {
      if (!data || !data.success || !data.meta) return;
      ['left', 'center', 'right'].forEach(slot => {
        const info = data.meta[slot];
        if (info && info.title) SLOT_LABELS[slot] = info.title;
      });
    })
    .catch(() => {
      // Backend fitur qr-images belum kepasang/offline -- diamkan aja,
      // kartu edit tetap jalan pakai judul default di SLOT_LABELS.
    });
}

const SLOT_LABELS = {
  left: 'Peluang Bisnis Investasi',
  center: 'Katalog Investasi',
  right: 'Profil Investasi Kota Palembang'
};

function pushAIMessage(text, chips) {
  chatHistory.push({ role: 'assistant', content: text });
  renderMessages(chatHistory);
  renderChips(chips || QUICK_CHIPS_DEFAULT);
  scrollChat();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderMessages(history) {
  const box = document.getElementById('chat-messages-box');
  if (!box) return;
  box.innerHTML = history.map(m => {
    if (m.role === 'assistant') {
      return `<div class="msg-ai">
        <div class="msg-ai-avatar"><i class="fa-solid fa-robot" style="font-size:10px;"></i></div>
        <div class="msg-ai-bubble">${escapeHtml(m.content)}</div>
      </div>`;
    }
    return `<div class="msg-user"><div class="msg-user-bubble">${escapeHtml(m.content)}</div></div>`;
  }).join('');
}

function showTyping() {
  const box = document.getElementById('chat-messages-box');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'typing-indicator';
  el.id = 'typing-el';
  el.innerHTML = `<div class="msg-ai-avatar"><i class="fa-solid fa-robot" style="font-size:10px;"></i></div>
    <div class="typing-dots"><span></span><span></span><span></span></div>`;
  box.appendChild(el);
  scrollChat();
}

function removeTyping() {
  const el = document.getElementById('typing-el');
  if (el) el.remove();
}

function scrollChat() {
  setTimeout(() => {
    const box = document.getElementById('chat-messages-box');
    if (box) box.scrollTop = box.scrollHeight;
  }, 50);
}

function renderChips(chips) {
  const area = document.getElementById('chat-chips-area');
  if (!area) return;
  if (!chips || chips.length === 0) {
    area.innerHTML = '';
    return;
  }
  area.innerHTML = `<div class="chat-chips-label"><i class="fa-solid fa-bolt" style="margin-right:4px;"></i>Pilih tindakan cepat</div>` +
    chips.map(c => `<button class="chip" onclick="handleChip('${c.replace(/'/g, "\\'")}')">${c}</button>`).join('');
}

function handleChip(text) {
  sendChatMessageText(text);
}

async function sendChatMessage() {
  const input = document.getElementById('chat-text-input');
  if (!input) return;
  const text = input.value.trim();
  // BARU: kalau ada lampiran gambar aktif, tetep boleh kirim walau kolom
  // teksnya kosong -- nanti detectQrEditIntent yang tangani (lihat di atas).
  if (!text && !pendingAttachment) return;
  if (aiTyping) return;
  input.value = '';
  sendChatMessageText(text || 'ganti gambar qr');
}

async function sendChatMessageText(text) {
  if (aiTyping) return;

  chatHistory.push({ role: 'user', content: text });
  renderMessages(chatHistory);
  scrollChat();
  renderChips([]);

  // BARU: coba dulu aksi navigasi LOKAL (scroll ke section, loncat ke
  // buku/halaman tertentu, ke kartu carousel, dst) SEBELUM manggil AI
  // backend. Kalau kena, kita SAMA SEKALI gak perlu nunggu round-trip ke
  // server -- langsung eksekusi + kasih konfirmasi. Kalau gak kena
  // (return null), lanjut ke jalur AI seperti biasa di bawah (unchanged).
  const localReply = detectAndExecuteLocalAction(text);
  if (localReply) {
    setTimeout(() => pushAIMessage(localReply, QUICK_CHIPS_EXPLORE), 250);
    return;
  }

  const flipbookEditIntent = detectFlipbookEditIntent(text);
  if (flipbookEditIntent) {
    if (!isAdmin) {
      setTimeout(() => {
        pushAIMessage('Fitur edit isi buku ini khusus admin yang sudah login. Silakan masuk ke sistem dulu ya.', QUICK_CHIPS_DEFAULT);
      }, 250);
      return;
    }
    if (flipbookEditIntent.bookIndex === null) {
      setTimeout(() => {
        pushAIMessage('Buku yang mana nih yang mau diedit — "Sejarah & Latar Belakang", "Visi & Misi", atau "Struktur & Layanan"?', QUICK_CHIPS_EXPLORE);
      }, 250);
      return;
    }
    if (!flipbookEditIntent.leaf) {
      setTimeout(() => {
        pushAIMessage('Bagian mana yang mau diedit — sampul depan, sampul belakang, atau halaman berapa?', QUICK_CHIPS_EXPLORE);
      }, 250);
      return;
    }
    setTimeout(() => openFlipbookEditCard(flipbookEditIntent.bookIndex, flipbookEditIntent.leaf), 250);
    return;
  }

  // BARU: cek niat "ganti gambar/judul QR". Kalau kena, JANGAN kirim apapun
  // ke /api/chat -- langsung munculin kartu form inline. Berkas gambar nanti
  // dikirim manual dari kartu itu langsung ke '/api/qr-images/:slot', gak
  // pernah lewat sini. Otorisasi sekarang lewat sesi admin (isAdmin), BUKAN
  // kata sandi manual lagi -- kalau yang chat bukan admin, kartunya gak
  // dimunculin sama sekali (gak ada gunanya nampilin form yang bakal
  // ditolak server).
  const qrEditIntent = detectQrEditIntent(text);
  if (qrEditIntent) {
    if (!isAdmin) {
      setTimeout(() => {
        pushAIMessage(
          'Fitur ganti gambar/judul QR ini khusus admin yang sudah login. Silakan masuk ke sistem dulu ya.',
          QUICK_CHIPS_DEFAULT
        );
      }, 250);
      return;
    }
    if (!qrEditIntent.slot) {
      setTimeout(() => {
        pushAIMessage(
          'Boleh, kotak QR yang mana nih yang mau diganti — "Peluang Bisnis Investasi" (kiri), "Katalog Investasi" (tengah), atau "Profil Investasi Kota Palembang" (kanan)?',
          QUICK_CHIPS_EXPLORE
        );
      }, 250);
      return;
    }
    setTimeout(() => openQrEditCard(qrEditIntent.slot), 250);
    return;
  }

  aiTyping = true;
  const btn = document.getElementById('chat-send-btn');
  if (btn) btn.disabled = true;
  showTyping();

  try {
    // Panggil backend sendiri (same-origin), bukan OpenRouter langsung.
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: chatHistory })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[AiChat.js] backend error:', data);
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    const fullText = data.reply ?? 'Maaf, terjadi kesalahan. Silakan coba lagi.';

    const chipsMatch = fullText.match(/\[CHIPS:\s*(\[.*?\])\]/s);
    let chips = QUICK_CHIPS_DEFAULT;
    let cleanText = fullText;

    if (chipsMatch) {
      try { chips = JSON.parse(chipsMatch[1]); } catch (e) { /* fallback ke default */ }
      cleanText = fullText.replace(/\[CHIPS:\s*\[.*?\]\]/s, '').trim();
    }
    cleanText = cleanText.replace(/\[NAV:\s*[A-Z_]+\]/g, '').trim();

    removeTyping();
    pushAIMessage(cleanText, chips);
    handleNavigation(fullText);
  } catch (err) {
    console.error('[AiChat.js]', err);
    removeTyping();
    pushAIMessage('Maaf, koneksi ke server AI terputus. Pastikan jaringan Anda stabil dan coba lagi.', QUICK_CHIPS_DEFAULT);
  }

  if (btn) btn.disabled = false;
  aiTyping = false;
}

function handleNavigation(fullAiText) {
  const navMatch = fullAiText.match(/\[NAV:\s*([A-Z_]+)\]/);
  if (!navMatch) return;

  const target = navMatch[1].trim();
  setTimeout(() => {
    try {
      const alpineRoot = document.body;
      const data = alpineRoot._x_dataStack && alpineRoot._x_dataStack[0];
      if (!data) return;

      // BARU: REGISTER, DASHBOARD_MASYARAKAT, DASHBOARD_PETUGAS,
      // DASHBOARD_ADMIN, dan FORM_LAPORAN sengaja DIHAPUS dari sini --
      // pendaftaran akun publik dan fitur pengaduan sudah tidak ada di
      // situs ini (lihat catatan BARU di kepala file). Kalau backend
      // somehow masih pernah mengirim salah satu tag itu, target-nya gak
      // akan cocok ke branch manapun di bawah -- diam-diam diabaikan.
      if (target === 'LOGIN') { data.v = 'login'; data.chatOpen = false; }
    } catch (err) { /* Alpine belum siap, abaikan */ }
  }, 900);
}

/* ==========================================================================
   BARU: TOMBOL LAMPIRKAN GAMBAR DI COMPOSER
   ==========================================================================
   Cuma nyimpen File object di memori (pendingAttachment) + nampilin preview
   nama filenya. File-nya BELUM diupload ke mana-mana di titik ini -- baru
   ikut kekirim pas kartu edit QR (openQrEditCard) di-submit.
   ========================================================================== */

const ALLOWED_ATTACH_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_ATTACH_SIZE = 5 * 1024 * 1024; // 5MB, samain sama batas di backend

let attachmentsBound = false;

function setupChatAttachments() {
  // Dipanggil tiap initAIChat() (tiap chat dibuka), tapi elemen DOM-nya
  // statis di index.html (gak ke-render ulang) -- makanya dijaga pakai
  // flag ini biar listener gak numpuk dobel-dobel tiap buka chat.
  if (attachmentsBound) return;
  attachmentsBound = true;

  const attachBtn = document.getElementById('chat-attach-btn');
  const attachInput = document.getElementById('chat-attach-input');
  const previewBox = document.getElementById('chat-attach-preview');
  const previewName = document.getElementById('chat-attach-preview-name');
  const removeBtn = document.getElementById('chat-attach-remove');

  if (!attachBtn || !attachInput) return;

  attachBtn.addEventListener('click', () => attachInput.click());

  attachInput.addEventListener('change', () => {
    const file = attachInput.files && attachInput.files[0];
    if (!file) return;

    if (ALLOWED_ATTACH_MIME.indexOf(file.type) === -1) {
      pushAIMessage('Format gambar itu belum didukung. Coba lampirkan PNG, JPG, WEBP, atau GIF ya.', QUICK_CHIPS_DEFAULT);
      attachInput.value = '';
      return;
    }
    if (file.size > MAX_ATTACH_SIZE) {
      pushAIMessage('Ukuran gambarnya kegedean, maksimal 5MB ya.', QUICK_CHIPS_DEFAULT);
      attachInput.value = '';
      return;
    }

    pendingAttachment = file;
    if (previewBox && previewName) {
      previewName.textContent = file.name;
      previewBox.classList.add('is-visible');
    }
  });

  if (removeBtn) {
    removeBtn.addEventListener('click', () => clearPendingAttachment());
  }
}

function clearPendingAttachment() {
  pendingAttachment = null;
  const attachInput = document.getElementById('chat-attach-input');
  const previewBox = document.getElementById('chat-attach-preview');
  if (attachInput) attachInput.value = '';
  if (previewBox) previewBox.classList.remove('is-visible');
}

/* ==========================================================================
   BARU: KARTU EDIT QR INLINE DI CHAT
   ==========================================================================
   Dibuat & disuntikkan LANGSUNG ke DOM #chat-messages-box (persis kayak pola
   showTyping()/removeTyping() di atas) -- BUKAN lewat chatHistory, supaya
   berkas gambar gak pernah ikut ke-serialize jadi bagian riwayat chat yang
   dikirim ke /api/chat. Kartu ini hanya pernah dipanggil kalau isAdmin true
   (lihat sendChatMessageText) -- jadi gak perlu lagi minta kata sandi di
   sini, otorisasi sudah ditentukan sesi admin yang sedang login.
   ========================================================================== */

function buildQrEditCardElement(slot, label) {
  const wrap = document.createElement('div');
  wrap.className = 'msg-ai chat-qr-card-wrap';

  wrap.innerHTML =
    '<div class="msg-ai-avatar"><i class="fa-solid fa-robot" style="font-size:10px;"></i></div>' +
    '<div class="chat-qr-card">' +
        '<div class="chat-qr-card-title">Perbarui Kotak — ' + escapeHtml(label) + '</div>' +
        '<p class="chat-qr-card-sub">Judul dan gambar bisa diubah salah satu atau dua-duanya.</p>' +
        '<label class="chat-qr-card-label">Judul Kotak' +
            '<input type="text" class="chat-qr-card-input" data-field="title" maxlength="80" value="' + escapeAttr(label) + '">' +
        '</label>' +
        '<label class="chat-qr-card-label">Gambar Baru (opsional — PNG/JPG/WEBP/GIF, maks 5MB)' +
            '<input type="file" class="chat-qr-card-input" data-field="image" accept="image/png,image/jpeg,image/webp,image/gif">' +
        '</label>' +
        '<p class="chat-qr-card-file-note" data-qr-card-file-note style="display:none;"></p>' +
        '<p class="chat-qr-card-error" data-qr-card-error style="display:none;"></p>' +
        '<div class="chat-qr-card-actions">' +
            '<button type="button" class="chat-qr-card-btn chat-qr-card-btn-ghost" data-action="cancel">Batal</button>' +
            '<button type="button" class="chat-qr-card-btn chat-qr-card-btn-primary" data-action="submit"><i class="fa-solid fa-upload"></i> Simpan</button>' +
        '</div>' +
    '</div>';

  return wrap;
}

function openQrEditCard(slot) {
  const box = document.getElementById('chat-messages-box');
  if (!box) return;

  const label = SLOT_LABELS[slot] || 'Kode QR Ini';
  const card = buildQrEditCardElement(slot, label);
  box.appendChild(card);
  scrollChat();

  const fileInput = card.querySelector('[data-field="image"]');
  const fileNote = card.querySelector('[data-qr-card-file-note]');
  const errorEl = card.querySelector('[data-qr-card-error]');
  const cancelBtn = card.querySelector('[data-action="cancel"]');
  const submitBtn = card.querySelector('[data-action="submit"]');

  // Kalau user udah lampirkan gambar duluan lewat tombol klip di composer,
  // langsung pasangkan ke input file kartu ini biar gak perlu pilih dua kali.
  if (pendingAttachment) {
    try {
      const dt = new DataTransfer();
      dt.items.add(pendingAttachment);
      fileInput.files = dt.files;
      fileNote.textContent = 'Gambar terlampir: ' + pendingAttachment.name;
      fileNote.style.display = 'block';
    } catch (err) {
      // Browser lama tanpa dukungan DataTransfer -- minta user pilih ulang
      // manual di kolom file kartu ini.
      fileNote.textContent = 'Gambar "' + pendingAttachment.name + '" terlampir, tapi tolong pilih ulang manual di kolom di atas ya.';
      fileNote.style.display = 'block';
    }
    clearPendingAttachment();
  }

  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files[0]) {
      fileNote.textContent = 'Gambar terlampir: ' + fileInput.files[0].name;
      fileNote.style.display = 'block';
    } else {
      fileNote.style.display = 'none';
    }
  });

  cancelBtn.addEventListener('click', () => {
    card.remove();
    pushAIMessage('Oke, gak jadi diubah ya.', QUICK_CHIPS_EXPLORE);
  });

  submitBtn.addEventListener('click', () => {
    errorEl.style.display = 'none';

    const title = card.querySelector('[data-field="title"]').value.trim();
    const file = fileInput.files && fileInput.files[0];

    const formData = new FormData();
    if (title) formData.append('title', title);
    if (file) formData.append('image', file);

    submitBtn.disabled = true;
    cancelBtn.disabled = true;
    submitBtn.innerHTML = 'Menyimpan...';

    // PENTING: request ini LANGSUNG ke endpoint backend qr-images milik
    // kita sendiri (same-origin), BUKAN lewat /api/chat -- berkas gambar
    // TIDAK PERNAH ikut lewat jalur AI/OpenRouter. Otorisasi ditentukan oleh
    // sesi admin yang sedang login (cookie), makanya credentials disertakan
    // eksplisit -- bukan lagi dari kata sandi yang diketik di sini.
    fetch('/api/qr-images/' + slot, {
      method: 'POST',
      body: formData,
      credentials: 'same-origin'
    })
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(result => {
        if (!result.ok || !result.data.success) {
          throw new Error(result.data.message || 'Gagal menyimpan perubahan.');
        }
        const entry = result.data.entry || {};
        applyQrUpdateToPage(slot, entry);
        if (entry.title) SLOT_LABELS[slot] = entry.title;

        card.remove();
        pushAIMessage('Sip, kotak "' + (entry.title || label) + '" berhasil diperbarui!', QUICK_CHIPS_EXPLORE);
      })
      .catch(err => {
        errorEl.textContent = err.message || 'Terjadi kesalahan yang tidak diketahui.';
        errorEl.style.display = 'block';
        submitBtn.disabled = false;
        cancelBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-upload"></i> Simpan';
      });
  });
}

window.initAIChat = initAIChat;
window.handleChip = handleChip;
window.sendChatMessage = sendChatMessage;