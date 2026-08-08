// js/MusicPlayer.js
//
// Pemutar musik latar mengambang. Tombol lingkaran mengambang (posisi
// pojok kanan bawah, senada dengan .chat-fab di pojok kiri bawah) yang
// saat diklik menampilkan panel (daftar lagu atau kontrol "sedang
// diputar") -- BUKAN langsung memutar lagu. Hingga 3 slot lagu bisa
// dikelola (tambah/ganti/hapus) lewat panel "Kelola Musik", yang cuma
// bisa diakses admin yang sedang login (bukan lagi lewat kata sandi
// manual -- lihat isAdmin/loadAdminStatus di bawah).
//
// Semua elemen (tombol, elemen <audio>, panel) dibuat otomatis lewat JS,
// tidak perlu menambah apa pun di index.html selain baris <link> CSS dan
// <script> ini sendiri.

(function () {
    var audioEl = null;
    var fabBtn = null;
    var fabIcon = null;
    var currentSlot = null;
    var isPlaying = false;
    var trackListCache = [];

    var SLOTS = ['slot1', 'slot2', 'slot3']; // harus sinkron dengan data/musicStore.js

    // BARU: status admin, dicek dari /api/auth/check-session (endpoint yang
    // sudah ada di routes/auth.js) -- dipakai buat nge-gate tombol "Kelola
    // Musik". Pengguna biasa (bukan admin / belum login) cuma bisa lihat &
    // putar lagu, gak akan pernah lihat tombol kelola-nya sama sekali.
    var isAdmin = false;

    function loadAdminStatus() {
        return fetch('/api/auth/check-session')
            .then(function (res) { return res.ok ? res.json() : null; })
            .then(function (data) {
                isAdmin = !!(data && data.logged_in && data.role === 'admin');
            })
            .catch(function () {
                isAdmin = false;
            });
    }

    function ensureAudioEl() {
        if (audioEl) return audioEl;
        audioEl = document.createElement('audio');
        audioEl.id = 'music-audio-el';
        audioEl.preload = 'none';
        audioEl.loop = true; // lagu otomatis mengulang dari awal, bukan berhenti sekali putar
        document.body.appendChild(audioEl);

        audioEl.addEventListener('play', function () { setPlayingState(true); });
        audioEl.addEventListener('pause', function () { setPlayingState(false); });
        // Catatan: dengan loop = true, event 'ended' TIDAK PERNAH terpicu
        // (itu memang perilaku standar <audio loop>). Listener ini dibiarkan
        // terpasang untuk jaga-jaga kalau suatu saat loop dimatikan lagi.
        audioEl.addEventListener('ended', function () {
            setPlayingState(false);
            currentSlot = null;
        });
        return audioEl;
    }

    function setPlayingState(playing) {
        isPlaying = playing;
        if (!fabBtn) return;
        fabBtn.classList.toggle('is-playing', playing);
        fabBtn.title = playing ? 'Musik sedang diputar' : 'Putar Musik';
        renderFabIcon();
    }

    function renderFabIcon() {
        if (!fabIcon) return;
        if (isPlaying) {
            // "Logo melodi" -- equalizer 3 batang beranimasi, indikator
            // visual bahwa musik sedang diputar.
            fabIcon.innerHTML =
                '<span class="music-eq"><span></span><span></span><span></span></span>';
        } else {
            fabIcon.innerHTML = '<i class="fa-solid fa-music"></i>';
        }
    }

    function ensureFab() {
        if (fabBtn) return fabBtn;

        fabBtn = document.createElement('button');
        fabBtn.className = 'music-fab';
        fabBtn.id = 'music-fab';
        fabBtn.type = 'button';
        fabBtn.title = 'Putar Musik';
        fabBtn.setAttribute('aria-label', 'Pemutar musik');

        fabIcon = document.createElement('span');
        fabIcon.className = 'music-fab-icon';
        fabBtn.appendChild(fabIcon);
        renderFabIcon();

        fabBtn.addEventListener('click', function () {
            togglePanel();
        });

        document.body.appendChild(fabBtn);
        return fabBtn;
    }

    /* ================================================================
       Panel (daftar lagu / sedang diputar / kelola musik)
       ================================================================ */
    function ensureModalRoot() {
        var root = document.getElementById('music-modal-root');
        if (!root) {
            root = document.createElement('div');
            root.id = 'music-modal-root';
            document.body.appendChild(root);
        }
        return root;
    }

    function closePanel() {
        var root = document.getElementById('music-modal-root');
        if (root) root.innerHTML = '';
        document.removeEventListener('keydown', onEscClose);
    }

    function onEscClose(e) {
        if (e.key === 'Escape') closePanel();
    }

    function bindOverlayClose(root) {
        var overlay = root.querySelector('.music-modal-overlay');
        overlay.addEventListener('click', function (e) {
            if (e.target.hasAttribute('data-music-close')) closePanel();
        });
        document.addEventListener('keydown', onEscClose);
    }

    function fireToast(message) {
        try {
            var data = document.body._x_dataStack && document.body._x_dataStack[0];
            if (data && typeof data.fire === 'function') data.fire(message);
        } catch (err) { /* no-op */ }
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str == null ? '' : str;
        return div.innerHTML;
    }

    // Pembungkus aman buat baca respons fetch yang DIHARAPKAN berupa JSON.
    // Server yang bener seharusnya balikin JSON di semua status (2xx maupun
    // error), tapi kalau request-nya 404 karena route-nya gak ada / salah
    // origin-port / situs dibuka tanpa backend asli, body yang balik
    // biasanya halaman HTML default (diawali "<!DOCTYPE html>"), bukan
    // JSON. Daripada langsung .json() dan meledak jadi
    // "Unexpected token '<' ... is not valid JSON", di sini kita baca
    // sebagai teks dulu, baru coba parse -- kalau gagal, lempar error yang
    // jelas nyebutin status HTTP-nya, biar gampang didiagnosis dari pesan
    // yang ditampilkan ke user maupun dari console.
    function parseJsonResponse(res) {
        return res.text().then(function (text) {
            var data = null;
            if (text) {
                try {
                    data = JSON.parse(text);
                } catch (err) {
                    console.error('[MusicPlayer] Respons bukan JSON (status ' + res.status + '). Kemungkinan endpoint API tidak ditemukan / server backend tidak berjalan di origin ini. Cuplikan respons:', text.slice(0, 200));
                    throw new Error('Server tidak merespons dengan benar (status ' + res.status + '). Endpoint API mungkin belum tersedia.');
                }
            }
            if (!res.ok) {
                throw new Error((data && data.message) || ('Permintaan gagal (status ' + res.status + ').'));
            }
            return data;
        });
    }

    function togglePanel() {
        var root = document.getElementById('music-modal-root');
        if (root && root.innerHTML.trim()) {
            closePanel();
            return;
        }
        if (isPlaying || currentSlot) {
            openNowPlayingPanel();
        } else {
            openTrackListPanel();
        }
    }

    function trackRowHtml(track) {
        var isActive = track.slot === currentSlot;
        return (
            '<div class="music-track-row' + (isActive ? ' is-active' : '') + '">' +
                '<div class="music-track-info">' +
                    '<span class="music-track-title">' + escapeHtml(track.title) + '</span>' +
                '</div>' +
                '<button type="button" class="music-track-play" data-play-slot="' + track.slot + '">' +
                    '<i class="fa-solid ' + (isActive && isPlaying ? 'fa-pause' : 'fa-play') + '"></i>' +
                '</button>' +
            '</div>'
        );
    }

    function openTrackListPanel() {
        var root = ensureModalRoot();

        // BARU: tombol "Kelola Musik" cuma dirender kalau admin lagi login.
        var manageButtonHtml = isAdmin
            ? '<button type="button" class="music-manage-link" data-open-manage>' +
                  '<i class="fa-solid fa-gear"></i> Kelola Musik' +
              '</button>'
            : '';

        root.innerHTML =
            '<div class="music-modal-overlay" data-music-close>' +
                '<div class="music-modal-box" role="dialog" aria-modal="true">' +
                    '<h3 class="music-modal-title">Pilih Musik</h3>' +
                    '<p class="music-modal-sub">Silakan pilih salah satu lagu untuk diputar.</p>' +
                    '<div class="music-track-list" data-track-list>' +
                        '<p class="music-loading">Memuat daftar lagu...</p>' +
                    '</div>' +
                    manageButtonHtml +
                    '<button type="button" class="music-modal-cancel" data-music-close>Tutup</button>' +
                '</div>' +
            '</div>';

        bindOverlayClose(root);
        var manageBtn = root.querySelector('[data-open-manage]');
        if (manageBtn) manageBtn.addEventListener('click', openManagePanel);

        fetchTrackList().then(function (tracks) {
            var listEl = root.querySelector('[data-track-list]');
            if (!listEl) return; // panel mungkin sudah ditutup pengguna

            if (!tracks.length) {
                listEl.innerHTML = '<p class="music-empty">Belum ada lagu yang tersedia. Silakan tambahkan lewat menu Kelola Musik.</p>';
                return;
            }

            listEl.innerHTML = tracks.map(trackRowHtml).join('');
            listEl.querySelectorAll('[data-play-slot]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var slot = btn.getAttribute('data-play-slot');

                    // Kalau lagu ini yang sedang aktif, tombol berfungsi
                    // sebagai jeda/lanjutkan -- bukan mengulang dari awal.
                    if (slot === currentSlot) {
                        var el = ensureAudioEl();
                        if (isPlaying) { el.pause(); } else { el.play().catch(function () {}); }
                        closePanel();
                        return;
                    }

                    playTrack(slot, tracks);
                });
            });
        });
    }

    function openNowPlayingPanel() {
        var root = ensureModalRoot();
        var track = trackListCache.find(function (t) { return t.slot === currentSlot; });
        var title = track ? track.title : 'Lagu Terpilih';

        root.innerHTML =
            '<div class="music-modal-overlay" data-music-close>' +
                '<div class="music-modal-box" role="dialog" aria-modal="true">' +
                    '<h3 class="music-modal-title">Sedang Diputar</h3>' +
                    '<p class="music-modal-sub">' + escapeHtml(title) + '</p>' +
                    '<button type="button" class="music-modal-btn music-modal-btn-primary" data-toggle-play>' +
                        '<i class="fa-solid ' + (isPlaying ? 'fa-pause' : 'fa-play') + '"></i> ' +
                        (isPlaying ? 'Jeda' : 'Lanjutkan') +
                    '</button>' +
                    '<button type="button" class="music-modal-btn music-modal-btn-ghost" data-change-track>' +
                        '<i class="fa-solid fa-list"></i> Ganti Lagu' +
                    '</button>' +
                    '<button type="button" class="music-modal-btn music-modal-btn-ghost" data-stop-track>' +
                        '<i class="fa-solid fa-stop"></i> Hentikan' +
                    '</button>' +
                    '<button type="button" class="music-modal-cancel" data-music-close>Tutup</button>' +
                '</div>' +
            '</div>';

        bindOverlayClose(root);

        root.querySelector('[data-toggle-play]').addEventListener('click', function () {
            var el = ensureAudioEl();
            if (isPlaying) { el.pause(); } else { el.play().catch(function () {}); }
            closePanel();
        });
        root.querySelector('[data-change-track]').addEventListener('click', openTrackListPanel);
        root.querySelector('[data-stop-track]').addEventListener('click', function () {
            var el = ensureAudioEl();
            el.pause();
            el.currentTime = 0;
            currentSlot = null;
            closePanel();
        });
    }

    function playTrack(slot, tracks) {
        trackListCache = tracks || trackListCache;
        var el = ensureAudioEl();
        currentSlot = slot;
        el.src = '/api/music/file/' + slot + '?v=' + Date.now();
        el.play().catch(function (err) {
            console.warn('[MusicPlayer] Gagal memutar otomatis:', err);
        });
        closePanel();
    }

    function fetchTrackList() {
        return fetch('/api/music/list')
            .then(function (res) { return res.ok ? res.json() : null; })
            .then(function (data) {
                if (!data || !data.success) return [];
                trackListCache = data.tracks || [];
                return trackListCache;
            })
            .catch(function (err) {
                console.warn('[MusicPlayer] Gagal memuat daftar lagu:', err);
                return [];
            });
    }

    /* ================================================================
       Panel kelola musik (tambah / ganti / hapus, dilindungi kata sandi)
       ================================================================ */
    function manageSlotRowHtml(slot, tracks) {
        var found = tracks.find(function (t) { return t.slot === slot; });
        return (
            '<div class="music-manage-row">' +
                '<div class="music-manage-row-head">' +
                    '<span class="music-manage-slot-name">' + (found ? escapeHtml(found.title) : 'Slot Kosong') + '</span>' +
                    (found ? '<button type="button" class="music-manage-delete" data-delete-slot="' + slot + '"><i class="fa-solid fa-trash"></i></button>' : '') +
                '</div>' +
                '<form class="music-edit-form" data-slot-form="' + slot + '">' +
                    '<input type="text" class="music-edit-input" name="title" placeholder="Judul lagu" value="' + (found ? escapeHtml(found.title) : '') + '" required>' +
                    '<input type="file" class="music-edit-input" name="audio" accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/mp4,audio/x-m4a,audio/webm" required>' +
                    '<button type="submit" class="music-modal-btn music-modal-btn-primary">' +
                        '<i class="fa-solid fa-upload"></i> ' + (found ? 'Ganti Lagu' : 'Unggah Lagu') +
                    '</button>' +
                '</form>' +
            '</div>'
        );
    }

    function openManagePanel() {
        var root = ensureModalRoot();

        root.innerHTML =
            '<div class="music-modal-overlay" data-music-close>' +
                '<div class="music-modal-box music-modal-box-wide" role="dialog" aria-modal="true">' +
                    '<h3 class="music-modal-title">Kelola Musik</h3>' +
                    '<p class="music-modal-sub">Tambah, ganti, atau hapus lagu (maksimal 3 lagu).</p>' +
                    '<p class="music-edit-error" data-manage-error style="display:none;"></p>' +
                    '<div class="music-manage-list" data-manage-list>' +
                        '<p class="music-loading">Memuat data lagu...</p>' +
                    '</div>' +
                    '<button type="button" class="music-modal-cancel" data-music-close>Tutup</button>' +
                '</div>' +
            '</div>';

        bindOverlayClose(root);

        fetchTrackList().then(function (tracks) {
            var listEl = root.querySelector('[data-manage-list]');
            if (!listEl) return;

            listEl.innerHTML = SLOTS.map(function (slot) {
                return manageSlotRowHtml(slot, tracks);
            }).join('');

            listEl.querySelectorAll('[data-slot-form]').forEach(function (form) {
                form.addEventListener('submit', function (e) {
                    e.preventDefault();
                    submitSlotUpload(form.getAttribute('data-slot-form'), form, root);
                });
            });

            listEl.querySelectorAll('[data-delete-slot]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    submitSlotDelete(btn.getAttribute('data-delete-slot'), root);
                });
            });
        });
    }

    function showManageError(root, message) {
        var errorEl = root.querySelector('[data-manage-error]');
        if (!errorEl) return;
        errorEl.textContent = message;
        errorEl.style.display = 'block';
    }

    function submitSlotUpload(slot, form, root) {
        var formData = new FormData(form);

        var submitBtn = form.querySelector('button[type="submit"]');
        var originalHtml = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = 'Mengunggah...';

        // credentials: 'same-origin' -- otorisasi sekarang ditentukan oleh
        // sesi admin yang sedang login (cookie), bukan lagi dari kata sandi
        // yang diketik di form.
        fetch('/api/music/' + slot, { method: 'POST', body: formData, credentials: 'same-origin' })
            .then(parseJsonResponse)
            .then(function (data) {
                if (!data || !data.success) {
                    throw new Error((data && data.message) || 'Gagal mengunggah lagu.');
                }
                fireToast('Lagu berhasil disimpan.');
                openManagePanel(); // muat ulang tampilan supaya sinkron
            })
            .catch(function (err) {
                showManageError(root, err.message || 'Terjadi kesalahan.');
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalHtml;
            });
    }

    function submitSlotDelete(slot, root) {
        fetch('/api/music/' + slot, {
            method: 'DELETE',
            credentials: 'same-origin'
        })
            .then(parseJsonResponse)
            .then(function (data) {
                if (!data || !data.success) {
                    throw new Error((data && data.message) || 'Gagal menghapus lagu.');
                }
                if (currentSlot === slot) {
                    var el = ensureAudioEl();
                    el.pause();
                    el.currentTime = 0;
                    currentSlot = null;
                }
                fireToast('Lagu berhasil dihapus.');
                openManagePanel();
            })
            .catch(function (err) {
                showManageError(root, err.message || 'Terjadi kesalahan.');
            });
    }

    document.addEventListener('DOMContentLoaded', function () {
        ensureAudioEl();
        ensureFab();
        fetchTrackList(); // preload cache biar panel pertama kebuka lebih cepat
        loadAdminStatus();
    });
})();