// js/AdminBar.js
//
// Kontrol kecil "Admin: <nama> — Keluar" yang muncul di hero-nav SAAT
// admin sedang login. Ini nutup celah yang muncul sejak alur login
// diubah supaya balik ke landing page (bukan ke dashboard admin lama):
// dulu satu-satunya tombol "Keluar" ada di dalam section dashboard-
// admin/petugas/masyarakat, yang sekarang SUDAH TIDAK PERNAH kebuka
// lagi -- jadi begitu admin login sekali, gak ada cara logout dari UI
// sama sekali. Sesi admin bakal tetap aktif (dan tombol edit di semua
// fitur tetap kelihatan) sampai cookie kadaluarsa sendiri (2 jam,
// lihat server.js), TANPA ada cara mempercepat/membatalkannya dari
// sisi pengguna.
//
// Ini KEMUNGKINAN BESAR akar dari laporan "walau gak login, masih bisa
// edit bebas" -- sesi admin dari percobaan sebelumnya kemungkinan besar
// masih aktif, cuma gak kelihatan/gak ada cara keluarnya.

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

    function loadSessionInfo() {
        return fetch('/api/auth/check-session')
            .then((res) => (res.ok ? res.json() : null))
            .catch(() => null);
    }

    function buildAdminBar(data) {
        const nav = document.querySelector('.hero-nav');
        if (!nav) return;

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

    document.addEventListener('DOMContentLoaded', function () {
        loadSessionInfo().then((data) => {
            if (data && data.logged_in && data.role === 'admin') {
                buildAdminBar(data);
            }
            // Kalau bukan admin/belum login -- gak ditambahin apa-apa,
            // hero-nav tetap kayak biasa.
        });
    });
})();