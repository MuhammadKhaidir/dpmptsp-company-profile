// js/AdminBar.js
//
// Kontrol kecil di hero-nav yang mencerminkan status login:
// - ADMIN sedang login  -> "Admin: <nama> — Keluar" (fitur lama, TETAP
//   ada persis kayak sebelumnya, gak diubah sama sekali).
// - BELUM login / bukan admin -> BARU: "Masuk sebagai Admin", diklik
//   langsung buka form login (v = 'login') lewat Alpine root state --
//   sebelumnya gak ada cara sama sekali buat orang yang belum login
//   masuk ke form login dari halaman utama tanpa lewat AI chat.
//
// BARU: dua-duanya (admin bar & pill login) sekarang di-refresh ULANG
// setiap kali Alpine ngirim event 'view-changed' (event ini didispatch
// dari js/App.js tiap kali `v` berubah -- lihat komentar di file itu,
// emang sengaja dibikin biar modul plain-JS kayak file ini bisa react
// tanpa perlu tau soal Alpine). Ini yang bikin: begitu orang klik
// "Masuk sebagai Admin" -> login sukses -> `v` balik ke 'landing',
// pill-nya otomatis ke-swap jadi "Admin: <nama> — Keluar" TANPA perlu
// refresh manual. Sebelumnya cuma dicek SEKALI pas DOMContentLoaded,
// jadi kalau login sambil di halaman yang sama, labelnya bakal nyangkut
// jadi "Masuk sebagai Admin" walau sebenernya udah login (baru kebaca
// bener kalau di-refresh manual).
//
// Ini nutup celah yang muncul sejak alur login diubah supaya balik ke
// landing page (bukan ke dashboard admin lama): dulu satu-satunya
// tombol "Keluar" ada di dalam section dashboard-admin/petugas/
// masyarakat, yang sekarang SUDAH TIDAK PERNAH kebuka lagi -- jadi
// begitu admin login sekali, gak ada cara logout dari UI sama sekali.

(function () {
    function el(tag, className) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        return node;
    }

    function fireToast(message) {
        try {
            const data = document.body._x_dataStack && document.body._x_dataStack[0];
            if (data && typeof data.fire === 'function') data.fire(message);
        } catch (err) { /* no-op */ }
    }

    // BARU: helper simetris sama fireToast() di atas -- numpang ke
    // Alpine root state yang sama (document.body._x_dataStack[0]) buat
    // ganti view aktif dari luar Alpine, tanpa modul ini perlu tau
    // apa-apa soal Alpine selain titik masuk ini.
    function setView(viewName) {
        try {
            const data = document.body._x_dataStack && document.body._x_dataStack[0];
            if (data) data.v = viewName;
        } catch (err) { /* no-op */ }
    }

    function loadSessionInfo() {
        return fetch('/api/auth/check-session')
            .then((res) => (res.ok ? res.json() : null))
            .catch(() => null);
    }

    // BARU: hapus pill/bar lama (admin ATAU login) sebelum nambahin yang
    // baru -- perlu karena sekarang refreshBar() bisa kepanggil berkali-
    // kali (tiap ganti view), bukan cuma sekali kayak sebelumnya. Tanpa
    // ini, tiap refresh bakal numpuk pill baru nempel ke yang lama.
    function clearExisting(nav) {
        const existing = nav.querySelector('.admin-bar-pill');
        if (existing) existing.remove();
    }

    function buildAdminBar(nav, data) {
        const bar = el('div', 'nav-pill admin-bar-pill');
        bar.style.display = 'inline-flex';
        bar.style.alignItems = 'center';
        bar.style.gap = '8px';

        const label = el('span');
        label.textContent = 'Admin: ' + (data.nama_lengkap || '');
        bar.appendChild(label);

        const logoutBtn = el('button');
        logoutBtn.type = 'button';
        logoutBtn.textContent = 'Keluar';
        logoutBtn.style.border = 'none';
        logoutBtn.style.background = 'transparent';
        logoutBtn.style.cursor = 'pointer';
        logoutBtn.style.fontWeight = '700';
        logoutBtn.style.color = 'inherit';
        logoutBtn.style.textDecoration = 'underline';
        logoutBtn.addEventListener('click', () => {
            logoutBtn.disabled = true;
            logoutBtn.textContent = '...';
            // credentials: 'same-origin' -- pastiin cookie sesi ikut kekirim
            // biar server tau sesi mana yang harus dihapus.
            fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
                .then(() => {
                    fireToast('Berhasil keluar dari sesi admin.');
                    setTimeout(() => { window.location.reload(); }, 400);
                })
                .catch(() => {
                    logoutBtn.disabled = false;
                    logoutBtn.textContent = 'Keluar';
                });
        });
        bar.appendChild(logoutBtn);

        nav.appendChild(bar);
    }

    // BARU: pill buat orang yang BELUM login / bukan admin -- klik
    // langsung pindah ke form login lewat setView('login'). Sengaja
    // TIDAK nyetel `color`/`background` inline biar warna & bentuk
    // pill-nya sepenuhnya ngikut class .nav-pill (sama persis kayak
    // nav pill lain: Dashboard/QR Kode/Dokumen/Maps) -- cuma reset
    // `border` & `font` yang emang beda default-nya antara <button>
    // sama <a> di sebagian besar browser.
    function buildLoginPill(nav) {
        const pill = el('button', 'nav-pill water-hover admin-bar-pill');
        pill.type = 'button';
        pill.style.display = 'inline-flex';
        pill.style.alignItems = 'center';
        pill.style.gap = '6px';
        pill.style.border = 'none';
        pill.style.font = 'inherit';
        pill.style.cursor = 'pointer';

        const icon = el('i', 'fa-solid fa-user-shield');
        pill.appendChild(icon);

        const label = el('span');
        label.textContent = 'Masuk sebagai Admin';
        pill.appendChild(label);

        pill.addEventListener('click', () => setView('login'));

        nav.appendChild(pill);
    }

    function refreshBar() {
        const nav = document.querySelector('.hero-nav');
        if (!nav) return;

        loadSessionInfo().then((data) => {
            clearExisting(nav);
            if (data && data.logged_in && data.role === 'admin') {
                buildAdminBar(nav, data);
            } else {
                buildLoginPill(nav);
            }
        });
    }

    document.addEventListener('DOMContentLoaded', refreshBar);

    // BARU: re-cek status login tiap kali Alpine pindah view (misal
    // 'login' -> 'landing' abis submit sukses), bukan cuma sekali di
    // awal. Lihat js/App.js -- event ini didispatch tiap `v` berubah.
    window.addEventListener('view-changed', refreshBar);
})();