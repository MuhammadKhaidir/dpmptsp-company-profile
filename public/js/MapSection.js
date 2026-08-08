// js/MapSection.js
//
// Peta interaktif lokasi investasi (Leaflet.js + tile CARTO/OpenStreetMap,
// gratis, tanpa API key). Titik lokasi disimpan lewat backend
// (data/mapStore.js + routes/map.js), dan bisa ditambah/diubah/dihapus
// lewat panel "Kelola Lokasi" yang cuma bisa diakses admin yang sedang
// login (bukan lagi lewat kata sandi manual -- lihat isAdmin/
// loadAdminStatus di bawah).
//
// FITUR PENCARIAN: kotak cari di pojok kiri-atas peta, mendukung
// 3 mode sekaligus dalam satu input --
//   1) Cari di antara lokasi yang SUDAH ditandai (judul/deskripsi)
//   2) Cari lokasi MANA PUN di dunia lewat Nominatim (OpenStreetMap),
//      gratis & tanpa API key, sama seperti tile peta yang sudah dipakai
//   3) Ketik koordinat langsung, mis. "-2.9909, 104.7566" (lat, lng) --
//      langsung lompat ke titik itu tanpa perlu request ke server
// Hasil dari mode 2 & 3 ditampilkan sebagai marker sementara (biru,
// belum tersimpan), lengkap tombol "Tambahkan ke Lokasi Investasi" (BARU:
// cuma tampil buat admin yang sedang login) yang membuka form tambah
// lokasi.
//
// FITUR RUTE (baru): tombol "Rute ke Sini" muncul di popup SETIAP
// marker -- baik lokasi investasi yang sudah tersimpan, maupun marker
// sementara hasil pencarian. Saat diklik:
//   1) Lokasi pengguna diambil lewat Geolocation API browser (butuh
//      izin lokasi, dan situs HARUS diakses lewat HTTPS atau
//      localhost -- ini syarat dari browser, bukan dari kode ini).
//   2) Rute dihitung lewat OSRM (Open Source Routing Machine), gratis
//      & tanpa API key, konsisten sama pendekatan tile peta & Nominatim
//      yang sudah dipakai. Server demo publiknya (router.project-osrm.org)
//      cuma nyediain profil "mobil"/driving, dan dipakai atas dasar
//      best-effort sesuai kebijakan resminya -- cocok buat trafik
//      kecil-menengah, bukan buat trafik produksi berat. Kalau nanti
//      butuh lebih stabil, tinggal ganti OSRM_BASE_URL ke OSRM
//      self-hosted atau provider lain yang kompatibel.
//   3) Rute digambar sebagai polyline di atas peta, plus panel info
//      jarak & estimasi waktu tempuh yang mengambang di pojok
//      kiri-bawah peta (bisa dibatalkan lewat tombol "Batalkan Rute").
// Backend (routes/map.js) TIDAK perlu diubah untuk fitur ini -- semua
// perhitungan rute dilakukan di sisi browser.
//
// WAJIB: Leaflet CSS & JS dimuat via CDN di index.html SEBELUM script ini.

(function () {
    var map = null;
    var markersLayer = null;
    var markersCache = [];
    var pickContext = null; // null | { returnMode: 'add'|'edit', id, draft }

    var DEFAULT_CENTER = [-2.9909, 104.7566]; // Palembang, Sumatera Selatan
    var DEFAULT_ZOOM = 11;

    // -- state untuk fitur pencarian --
    var searchDebounceTimer = null;
    var searchAbortController = null;
    var tempSearchMarker = null; // marker sementara hasil pencarian (belum disimpan)
    var MIN_REMOTE_QUERY_LENGTH = 3; // minimal karakter sebelum cari ke Nominatim

    // -- state untuk fitur rute perjalanan --
    var OSRM_BASE_URL = 'https://router.project-osrm.org/route/v1/driving/';
    var routeLayerGroup = null; // L.layerGroup berisi garis rute (halo putih + garis utama)
    var userLocationMarker = null; // marker titik lokasi pengguna saat ini
    var routeAbortController = null;
    var routeDestination = null; // { lat, lng, label } tujuan rute yang sedang aktif (dipakai tombol "Coba Lagi")
    var routeRequestId = 0; // penanda supaya hasil geolocation/fetch yang sudah "basi" (dibatalkan/diganti rute baru) tidak dipakai

    // BARU: status admin, dicek dari /api/auth/check-session (endpoint yang
    // sudah ada di routes/auth.js) -- dipakai buat nge-gate tombol "Kelola
    // Lokasi" dan tombol "Tambahkan ke Lokasi Investasi" di popup hasil
    // pencarian. Pengguna biasa (bukan admin / belum login) cuma bisa lihat
    // peta, cari lokasi, dan minta rute -- gak akan pernah lihat tombol
    // kelola/tambah lokasi sama sekali.
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

    function escapeHtml(str) {
        return String(str == null ? '' : str).replace(/[&<>"']/g, function (ch) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
        });
    }

    function fireToast(message) {
        try {
            var data = document.body._x_dataStack && document.body._x_dataStack[0];
            if (data && typeof data.fire === 'function') data.fire(message);
        } catch (err) { /* no-op */ }
    }

    /* ================================================================
       Inisialisasi peta
       ================================================================ */
    function buildMarkerIcon() {
        return L.divIcon({
            className: 'map-pin-icon',
            html: '<span class="map-pin-dot"><i class="fa-solid fa-location-dot"></i></span>',
            iconSize: [34, 34],
            iconAnchor: [17, 32],
            popupAnchor: [0, -30]
        });
    }

    function buildTempMarkerIcon() {
        return L.divIcon({
            className: 'map-pin-icon map-pin-icon-temp',
            html: '<span class="map-pin-dot map-pin-dot-temp"><i class="fa-solid fa-location-crosshairs"></i></span>',
            iconSize: [34, 34],
            iconAnchor: [17, 32],
            popupAnchor: [0, -30]
        });
    }

    function buildUserLocationIcon() {
        return L.divIcon({
            className: 'map-user-location-icon',
            html: '<span class="map-user-location-pulse"></span><span class="map-user-location-dot"></span>',
            iconSize: [22, 22],
            iconAnchor: [11, 11]
        });
    }

    function popupHtml(loc) {
        var html = '<div class="map-popup-title">' + escapeHtml(loc.title) + '</div>';
        if (loc.description) {
            html += '<div class="map-popup-desc">' + escapeHtml(loc.description) + '</div>';
        }
        html += '<button type="button" class="map-popup-route-btn" data-route-btn>' +
                    '<i class="fa-solid fa-route"></i> Rute ke Sini' +
                '</button>';
        return html;
    }

    function tempPopupHtml(lat, lng, label) {
        var html = '<div class="map-popup-title">' + escapeHtml(label || 'Lokasi Terpilih') + '</div>';
        html += '<div class="map-popup-desc">' + lat.toFixed(5) + ', ' + lng.toFixed(5) + '</div>';
        html += '<button type="button" class="map-popup-route-btn" data-route-btn>' +
                    '<i class="fa-solid fa-route"></i> Rute ke Sini' +
                '</button>';
        // BARU: tombol "Tambahkan ke Lokasi Investasi" cuma dirender kalau
        // admin lagi login -- lihat isAdmin di atas.
        if (isAdmin) {
            html += '<button type="button" class="map-popup-add-btn" data-temp-add>' +
                        '<i class="fa-solid fa-map-pin"></i> Tambahkan ke Lokasi Investasi' +
                    '</button>';
        }
        return html;
    }

    function renderAllMarkers() {
        if (!markersLayer) return;
        markersLayer.clearLayers();
        markersCache.forEach(function (loc) {
            var marker = L.marker([loc.lat, loc.lng], { icon: buildMarkerIcon() })
                .bindPopup(popupHtml(loc))
                .addTo(markersLayer);
            marker.on('popupopen', function (e) {
                bindRouteButtonInPopup(e.popup, loc.lat, loc.lng, loc.title);
            });
        });
    }

    function loadLocations() {
        return fetch('/api/map/list')
            .then(function (res) { return res.ok ? res.json() : null; })
            .then(function (data) {
                if (!data || !data.success) return markersCache;
                markersCache = data.locations || [];
                renderAllMarkers();
                return markersCache;
            })
            .catch(function () {
                // Backend fitur peta belum kepasang/offline -- diamkan aja,
                // peta tetap tampil tanpa titik.
                return markersCache;
            });
    }

    function initMap() {
        var mapEl = document.getElementById('investment-map');
        if (!mapEl) return;

        if (typeof L === 'undefined') {
            console.warn('[MapSection] Library Leaflet belum termuat -- pastikan <link>/<script> Leaflet ada di index.html sebelum js/MapSection.js.');
            mapEl.innerHTML = '<p style="padding:24px;font-family:Inter,sans-serif;font-size:13px;color:rgba(17,17,17,.5);">Peta tidak dapat dimuat.</p>';
            return;
        }

        map = L.map(mapEl, {
            center: DEFAULT_CENTER,
            zoom: DEFAULT_ZOOM,
            scrollWheelZoom: false // biar scroll halaman gak "kejebak" di peta
        });

        // Klik sekali biar scroll-zoom aktif -- pengalaman umum di banyak
        // peta embed, biar user gak kepancing scroll halaman malah
        // nge-zoom peta tanpa sengaja.
        map.on('click', function () { map.scrollWheelZoom.enable(); });

        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            maxZoom: 19
        }).addTo(map);

        markersLayer = L.layerGroup().addTo(map);

        map.on('click', onMapClick);

        loadLocations();
    }

    /* ================================================================
       Mode "menandai lokasi" -- aktif saat user menekan "Tambah Lokasi
       Baru" atau "Tandai Ulang Posisi" di dalam form. Selagi aktif, klik
       BERIKUTNYA pada peta dipakai sebagai koordinat, lalu form
       tambah/ubah ditampilkan (bukan langsung tersimpan otomatis).
       ================================================================ */
    function startPickMode(context) {
        pickContext = context;
        closeModal();
        clearTempSearchMarker();
        var mapEl = document.getElementById('investment-map');
        var banner = document.getElementById('map-pick-banner');
        var searchBox = document.getElementById('map-search-box');
        if (mapEl) mapEl.classList.add('is-picking');
        if (banner) banner.classList.add('is-active');
        if (searchBox) searchBox.classList.add('is-disabled');
    }

    function stopPickMode() {
        pickContext = null;
        var mapEl = document.getElementById('investment-map');
        var banner = document.getElementById('map-pick-banner');
        var searchBox = document.getElementById('map-search-box');
        if (mapEl) mapEl.classList.remove('is-picking');
        if (banner) banner.classList.remove('is-active');
        if (searchBox) searchBox.classList.remove('is-disabled');
    }

    function onMapClick(e) {
        if (!pickContext) return; // klik biasa di luar mode menandai -- abaikan
        var latlng = { lat: e.latlng.lat, lng: e.latlng.lng };
        var ctx = pickContext;
        var draft = ctx.draft || {};
        stopPickMode();

        openLocationForm(ctx.returnMode, {
            id: ctx.id,
            lat: latlng.lat,
            lng: latlng.lng,
            title: draft.title,
            description: draft.description
        });
    }

    /* ================================================================
       Modal root (dipakai ulang buat panel kelola & form tambah/edit)
       ================================================================ */
    function ensureModalRoot() {
        var root = document.getElementById('map-modal-root');
        if (!root) {
            root = document.createElement('div');
            root.id = 'map-modal-root';
            document.body.appendChild(root);
        }
        return root;
    }

    function closeModal() {
        var root = document.getElementById('map-modal-root');
        if (root) root.innerHTML = '';
        document.removeEventListener('keydown', onEscClose);
    }

    function onEscClose(e) {
        if (e.key === 'Escape') {
            closeModal();
            stopPickMode();
        }
    }

    function bindOverlayClose(root) {
        var overlay = root.querySelector('.map-modal-overlay');
        overlay.addEventListener('click', function (e) {
            if (e.target.hasAttribute('data-map-close')) closeModal();
        });
        document.addEventListener('keydown', onEscClose);
    }

    /* ================================================================
       Panel "Kelola Lokasi"
       ================================================================ */
    function locationRowHtml(loc) {
        return (
            '<div class="map-location-row">' +
                '<div class="map-location-row-head">' +
                    '<div>' +
                        '<div class="map-location-title">' + escapeHtml(loc.title) + '</div>' +
                        '<div class="map-location-coords">' + loc.lat.toFixed(5) + ', ' + loc.lng.toFixed(5) + '</div>' +
                    '</div>' +
                    '<div class="map-location-row-actions">' +
                        '<button type="button" class="map-location-edit" data-edit-id="' + loc.id + '"><i class="fa-solid fa-pen"></i></button>' +
                        '<button type="button" class="map-location-delete" data-delete-id="' + loc.id + '"><i class="fa-solid fa-trash"></i></button>' +
                    '</div>' +
                '</div>' +
            '</div>'
        );
    }

    function openManagePanel() {
        var root = ensureModalRoot();

        root.innerHTML =
            '<div class="map-modal-overlay" data-map-close>' +
                '<div class="map-modal-box map-modal-box-wide" role="dialog" aria-modal="true">' +
                    '<h3 class="map-modal-title">Kelola Lokasi Investasi</h3>' +
                    '<p class="map-modal-sub">Tambah, ubah, atau hapus titik lokasi pada peta.</p>' +
                    '<p class="map-edit-error" data-manage-error style="display:none;"></p>' +
                    '<button type="button" class="map-modal-btn map-modal-btn-primary" data-add-location>' +
                        '<i class="fa-solid fa-map-pin"></i> Tambah Lokasi Baru' +
                    '</button>' +
                    '<div class="map-location-list" data-location-list>' +
                        '<p class="map-loading">Memuat daftar lokasi...</p>' +
                    '</div>' +
                    '<button type="button" class="map-modal-cancel" data-map-close>Tutup</button>' +
                '</div>' +
            '</div>';

        bindOverlayClose(root);

        root.querySelector('[data-add-location]').addEventListener('click', function () {
            startPickMode({ returnMode: 'add', draft: {} });
        });

        loadLocations().then(function (locations) {
            var listEl = root.querySelector('[data-location-list]');
            if (!listEl) return; // panel mungkin sudah ditutup pengguna

            if (!locations.length) {
                listEl.innerHTML = '<p class="map-empty">Belum ada lokasi yang ditandai. Silakan tambahkan lewat tombol di atas.</p>';
                return;
            }

            listEl.innerHTML = locations.map(locationRowHtml).join('');

            listEl.querySelectorAll('[data-edit-id]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var id = btn.getAttribute('data-edit-id');
                    var loc = markersCache.find(function (l) { return l.id === id; });
                    if (loc) openLocationForm('edit', loc);
                });
            });

            listEl.querySelectorAll('[data-delete-id]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    submitDelete(btn.getAttribute('data-delete-id'), root);
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

    function submitDelete(id, root) {
        fetch('/api/map/' + id, {
            method: 'DELETE',
            credentials: 'same-origin'
        })
            .then(function (res) {
                return res.json().then(function (data) { return { ok: res.ok, data: data }; });
            })
            .then(function (result) {
                if (!result.ok || !result.data.success) {
                    throw new Error(result.data.message || 'Gagal menghapus lokasi.');
                }
                fireToast('Lokasi berhasil dihapus.');
                openManagePanel(); // muat ulang panel supaya sinkron
            })
            .catch(function (err) {
                showManageError(root, err.message || 'Terjadi kesalahan.');
            });
    }

    /* ================================================================
       Form tambah/ubah lokasi -- muncul SETELAH koordinat dipilih di
       peta (lewat startPickMode) ATAU langsung dari hasil pencarian
       (koordinat sudah diketahui, jadi bisa lompat langsung ke form).
       Tombol "Tandai Ulang Posisi" menutup form ini dan mengaktifkan
       lagi mode menandai (judul/deskripsi yang sudah diisi ikut dibawa
       lewat draft, gak hilang).
       ================================================================ */
    function openLocationForm(mode, data) {
        var root = ensureModalRoot();
        var isEdit = mode === 'edit';
        var title = isEdit ? 'Ubah Lokasi' : 'Tambah Lokasi Baru';
        var submitLabel = isEdit ? 'Simpan Perubahan' : 'Simpan Lokasi';

        root.innerHTML =
            '<div class="map-modal-overlay" data-map-close>' +
                '<div class="map-modal-box" role="dialog" aria-modal="true">' +
                    '<h3 class="map-modal-title">' + title + '</h3>' +
                    '<p class="map-modal-sub">Koordinat: ' + data.lat.toFixed(5) + ', ' + data.lng.toFixed(5) + '</p>' +
                    '<form class="map-edit-form" data-location-form>' +
                        '<label class="map-edit-label">Judul Lokasi' +
                            '<input type="text" class="map-edit-input" name="title" maxlength="100" required value="' + escapeHtml(data.title || '') + '">' +
                        '</label>' +
                        '<label class="map-edit-label">Deskripsi (opsional)' +
                            '<textarea class="map-edit-textarea" name="description" rows="3" maxlength="600">' + escapeHtml(data.description || '') + '</textarea>' +
                        '</label>' +
                        '<button type="button" class="map-modal-btn map-modal-btn-ghost" data-reposition>' +
                            '<i class="fa-solid fa-crosshairs"></i> Tandai Ulang Posisi di Peta' +
                        '</button>' +
                        '<p class="map-edit-error" data-form-error style="display:none;"></p>' +
                        '<div class="map-edit-actions">' +
                            '<button type="button" class="map-modal-cancel" data-map-close>Batal</button>' +
                            '<button type="submit" class="map-modal-btn map-modal-btn-primary" data-form-submit>' +
                                '<i class="fa-solid fa-floppy-disk"></i> ' + submitLabel +
                            '</button>' +
                        '</div>' +
                    '</form>' +
                '</div>' +
            '</div>';

        bindOverlayClose(root);

        var form = root.querySelector('[data-location-form]');
        var errorEl = root.querySelector('[data-form-error]');
        var submitBtn = root.querySelector('[data-form-submit]');

        root.querySelector('[data-reposition]').addEventListener('click', function () {
            var draft = {
                title: form.querySelector('[name="title"]').value,
                description: form.querySelector('[name="description"]').value
            };
            startPickMode({
                returnMode: mode,
                id: isEdit ? data.id : undefined,
                draft: draft
            });
        });

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            errorEl.style.display = 'none';

            var payload = {
                title: form.querySelector('[name="title"]').value,
                description: form.querySelector('[name="description"]').value,
                lat: data.lat,
                lng: data.lng
            };

            submitBtn.disabled = true;
            submitBtn.innerHTML = 'Sedang Menyimpan...';

            var url = isEdit ? '/api/map/' + data.id : '/api/map';
            var method = isEdit ? 'PUT' : 'POST';

            fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                credentials: 'same-origin'
            })
                .then(function (res) {
                    return res.json().then(function (d) { return { ok: res.ok, data: d }; });
                })
                .then(function (result) {
                    if (!result.ok || !result.data.success) {
                        throw new Error(result.data.message || 'Gagal menyimpan lokasi.');
                    }
                    return loadLocations();
                })
                .then(function () {
                    closeModal();
                    fireToast(isEdit ? 'Lokasi berhasil diperbarui.' : 'Lokasi baru berhasil ditambahkan.');
                    clearTempSearchMarker(); // sudah tersimpan permanen -- buang marker sementara
                    openManagePanel();
                })
                .catch(function (err) {
                    errorEl.textContent = err.message || 'Terjadi kesalahan yang tidak diketahui.';
                    errorEl.style.display = 'block';
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> ' + submitLabel;
                });
        });
    }

    function setupManageButton() {
        var btn = document.getElementById('map-manage-btn');
        if (!btn) return;
        // BARU: tombol ini sudah disembunyikan (display:none) dari awal
        // lewat DOMContentLoaded di bawah, sebelum status admin dipastikan.
        // Baru ditampilkan lagi di sini kalau memang admin.
        if (isAdmin) {
            btn.style.display = '';
            btn.addEventListener('click', openManagePanel);
        }
    }

    function setupPickCancelButton() {
        var cancelBtn = document.getElementById('map-pick-cancel');
        if (!cancelBtn) return;
        cancelBtn.addEventListener('click', function () {
            stopPickMode();
            openManagePanel();
        });
    }

    /* ================================================================
       FITUR PENCARIAN
       ================================================================
       Satu kotak input, tiga mode deteksi otomatis:

       1) Koordinat -- kalau teks yang diketik cocok pola "lat, lng"
          (mis. "-2.9909, 104.7566" atau "-2.9909 104.7566"), langsung
          tampilkan opsi "lompat ke koordinat ini" tanpa perlu request
          apa pun, sekalian coba cari nama tempat di titik itu di
          latar belakang (reverse geocoding, best-effort).

       2) Lokasi yang sudah ditandai -- difilter langsung dari
          markersCache yang sudah ada di memori (instan, tanpa network).

       3) Lokasi mana pun -- dicari lewat Nominatim (API pencarian
          OpenStreetMap, gratis & tanpa API key, konsisten dengan tile
          peta yang sudah dipakai). Hasil disortir kira-kira berdasar
          jarak ke area yang sedang dilihat di peta.
       ================================================================ */

    function parseCoordinateInput(query) {
        var match = query.match(/^(-?\d{1,3}(?:\.\d+)?)[\s,;]+(-?\d{1,3}(?:\.\d+)?)$/);
        if (!match) return null;
        var lat = parseFloat(match[1]);
        var lng = parseFloat(match[2]);
        if (isNaN(lat) || isNaN(lng)) return null;
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
        return { lat: lat, lng: lng };
    }

    function filterMarkedLocations(query) {
        var q = query.toLowerCase();
        return markersCache.filter(function (loc) {
            var title = (loc.title || '').toLowerCase();
            var desc = (loc.description || '').toLowerCase();
            return title.indexOf(q) !== -1 || desc.indexOf(q) !== -1;
        }).slice(0, 8);
    }

    function buildViewboxParam() {
        // Bias hasil pencarian ke area yang sedang dilihat di peta (atau
        // pusat default kalau peta belum siap), TANPA membatasi hasil
        // secara ketat -- lokasi di luar area itu tetap bisa muncul.
        var center = DEFAULT_CENTER;
        if (map) {
            var c = map.getCenter();
            center = [c.lat, c.lng];
        }
        var pad = 3; // derajat
        return [
            center[1] - pad, center[0] + pad,
            center[1] + pad, center[0] - pad
        ].join(',');
    }

    function mapNominatimItem(item) {
        return {
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
            label: item.display_name
        };
    }

    function forwardGeocode(query, signal) {
        var params = new URLSearchParams({
            format: 'jsonv2',
            q: query,
            limit: '6',
            addressdetails: '1',
            bounded: '0'
        });
        params.set('viewbox', buildViewboxParam());

        return fetch('https://nominatim.openstreetmap.org/search?' + params.toString(), { signal: signal })
            .then(function (res) { return res.ok ? res.json() : []; })
            .then(function (data) {
                if (!Array.isArray(data)) return [];
                return data.map(mapNominatimItem);
            });
    }

    function reverseGeocode(lat, lng, signal) {
        var params = new URLSearchParams({
            format: 'jsonv2',
            lat: String(lat),
            lon: String(lng),
            zoom: '16'
        });

        return fetch('https://nominatim.openstreetmap.org/reverse?' + params.toString(), { signal: signal })
            .then(function (res) { return res.ok ? res.json() : null; })
            .then(function (data) {
                return data && data.display_name ? data.display_name : null;
            });
    }

    function performSearch(rawQuery) {
        var query = (rawQuery || '').trim();

        if (searchAbortController) searchAbortController.abort();

        if (!query) {
            renderSearchResults({});
            return;
        }

        var coordMatch = parseCoordinateInput(query);
        var markedMatches = filterMarkedLocations(query);

        if (coordMatch) {
            // Mode koordinat -- langsung tampil, cari nama tempatnya di
            // latar belakang (kalau gagal/lambat, tetap bisa langsung
            // dipakai berbekal angka koordinatnya saja).
            renderSearchResults({ coord: coordMatch, marked: markedMatches, loading: true, remoteMode: 'reverse' });

            searchAbortController = new AbortController();
            reverseGeocode(coordMatch.lat, coordMatch.lng, searchAbortController.signal)
                .then(function (label) {
                    renderSearchResults({ coord: coordMatch, coordLabel: label, marked: markedMatches, loading: false, remoteMode: 'reverse' });
                })
                .catch(function (err) {
                    if (err && err.name === 'AbortError') return;
                    renderSearchResults({ coord: coordMatch, marked: markedMatches, loading: false, remoteMode: 'reverse' });
                });
            return;
        }

        if (query.length < MIN_REMOTE_QUERY_LENGTH) {
            // Terlalu pendek buat dicari ke Nominatim -- cukup tampilkan
            // hasil dari lokasi yang sudah ditandai (instan, gratis).
            renderSearchResults({ marked: markedMatches, remoteMode: 'forward', tooShort: true });
            return;
        }

        renderSearchResults({ marked: markedMatches, loading: true, remoteMode: 'forward' });

        searchAbortController = new AbortController();
        forwardGeocode(query, searchAbortController.signal)
            .then(function (remoteResults) {
                renderSearchResults({ marked: markedMatches, remote: remoteResults, loading: false, remoteMode: 'forward' });
            })
            .catch(function (err) {
                if (err && err.name === 'AbortError') return;
                renderSearchResults({ marked: markedMatches, remote: [], remoteError: true, loading: false, remoteMode: 'forward' });
            });
    }

    function renderSearchResults(state) {
        state = state || {};
        var resultsEl = document.getElementById('map-search-results');
        if (!resultsEl) return;

        var hasAnything = state.coord || state.marked || state.loading || state.remote || state.remoteError || state.tooShort;
        if (!hasAnything) {
            resultsEl.classList.remove('is-active');
            resultsEl.innerHTML = '';
            return;
        }

        var sections = [];

        if (state.coord) {
            var subText = state.coord.lat.toFixed(5) + ', ' + state.coord.lng.toFixed(5);
            if (state.loading && !state.coordLabel) subText += ' &middot; mencari nama tempat...';
            sections.push(
                '<div class="map-search-section">' +
                    '<div class="map-search-section-label">Koordinat</div>' +
                    '<button type="button" class="map-search-item" data-result-type="coord" ' +
                        'data-lat="' + state.coord.lat + '" data-lng="' + state.coord.lng + '" ' +
                        'data-label="' + escapeHtml(state.coordLabel || '') + '">' +
                        '<i class="fa-solid fa-crosshairs"></i>' +
                        '<div class="map-search-item-text">' +
                            '<div class="map-search-item-title">' + (state.coordLabel ? escapeHtml(state.coordLabel) : 'Lompat ke koordinat ini') + '</div>' +
                            '<div class="map-search-item-sub">' + subText + '</div>' +
                        '</div>' +
                    '</button>' +
                '</div>'
            );
        }

        if (state.marked && state.marked.length) {
            sections.push(
                '<div class="map-search-section">' +
                    '<div class="map-search-section-label">Lokasi yang Ditandai</div>' +
                    state.marked.map(function (loc) {
                        return (
                            '<button type="button" class="map-search-item" data-result-type="marked" ' +
                                'data-lat="' + loc.lat + '" data-lng="' + loc.lng + '">' +
                                '<i class="fa-solid fa-map-pin"></i>' +
                                '<div class="map-search-item-text">' +
                                    '<div class="map-search-item-title">' + escapeHtml(loc.title) + '</div>' +
                                    '<div class="map-search-item-sub">' + loc.lat.toFixed(5) + ', ' + loc.lng.toFixed(5) + '</div>' +
                                '</div>' +
                            '</button>'
                        );
                    }).join('') +
                '</div>'
            );
        }

        if (state.remoteMode === 'forward') {
            if (state.loading) {
                sections.push(
                    '<div class="map-search-section">' +
                        '<div class="map-search-loading"><i class="fa-solid fa-spinner fa-spin"></i> Mencari lokasi lain...</div>' +
                    '</div>'
                );
            } else if (state.remoteError) {
                sections.push(
                    '<div class="map-search-section">' +
                        '<div class="map-search-empty">Gagal mencari lokasi lain. Periksa koneksi internet.</div>' +
                    '</div>'
                );
            } else if (state.remote && state.remote.length) {
                sections.push(
                    '<div class="map-search-section">' +
                        '<div class="map-search-section-label">Lokasi Lain</div>' +
                        state.remote.map(function (item, idx) {
                            return (
                                '<button type="button" class="map-search-item" data-result-type="remote" data-remote-index="' + idx + '">' +
                                    '<i class="fa-solid fa-earth-asia"></i>' +
                                    '<div class="map-search-item-text">' +
                                        '<div class="map-search-item-title">' + escapeHtml(item.label) + '</div>' +
                                        '<div class="map-search-item-sub">' + item.lat.toFixed(5) + ', ' + item.lng.toFixed(5) + '</div>' +
                                    '</div>' +
                                '</button>'
                            );
                        }).join('') +
                    '</div>'
                );
            } else if (state.tooShort) {
                sections.push(
                    '<div class="map-search-section">' +
                        '<div class="map-search-empty">Ketik minimal ' + MIN_REMOTE_QUERY_LENGTH + ' karakter untuk mencari lokasi lain di luar yang ditandai.</div>' +
                    '</div>'
                );
            }
        }

        if (!sections.length) {
            resultsEl.innerHTML = '<div class="map-search-empty">Tidak ada hasil yang cocok.</div>';
        } else {
            resultsEl.innerHTML = sections.join('');
        }

        resultsEl.classList.add('is-active');

        resultsEl.querySelectorAll('[data-result-type="coord"]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                selectCoordResult(
                    { lat: parseFloat(btn.getAttribute('data-lat')), lng: parseFloat(btn.getAttribute('data-lng')) },
                    btn.getAttribute('data-label') || null
                );
            });
        });

        resultsEl.querySelectorAll('[data-result-type="marked"]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                selectMarkedResult({ lat: parseFloat(btn.getAttribute('data-lat')), lng: parseFloat(btn.getAttribute('data-lng')) });
            });
        });

        resultsEl.querySelectorAll('[data-result-type="remote"]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var idx = parseInt(btn.getAttribute('data-remote-index'), 10);
                var item = state.remote && state.remote[idx];
                if (item) selectRemoteResult(item);
            });
        });
    }

    function selectMarkedResult(loc) {
        closeSearchResults(false);
        clearTempSearchMarker();
        if (!map) return;
        map.flyTo([loc.lat, loc.lng], Math.max(map.getZoom(), 15), { duration: 0.75 });
        markersLayer.eachLayer(function (layer) {
            var ll = layer.getLatLng();
            if (Math.abs(ll.lat - loc.lat) < 1e-7 && Math.abs(ll.lng - loc.lng) < 1e-7) {
                layer.openPopup();
            }
        });
    }

    function selectCoordResult(coord, label) {
        closeSearchResults(false);
        if (!map) return;
        map.flyTo([coord.lat, coord.lng], Math.max(map.getZoom(), 15), { duration: 0.75 });
        showTempSearchMarker(coord.lat, coord.lng, label);
    }

    function selectRemoteResult(item) {
        closeSearchResults(false);
        if (!map) return;
        map.flyTo([item.lat, item.lng], Math.max(map.getZoom(), 15), { duration: 0.75 });
        showTempSearchMarker(item.lat, item.lng, item.label);
    }

    function showTempSearchMarker(lat, lng, label) {
        clearTempSearchMarker();
        if (!map) return;

        tempSearchMarker = L.marker([lat, lng], { icon: buildTempMarkerIcon() }).addTo(map);
        tempSearchMarker.bindPopup(tempPopupHtml(lat, lng, label));
        tempSearchMarker.openPopup();

        tempSearchMarker.on('popupopen', function (e) {
            bindRouteButtonInPopup(e.popup, lat, lng, label || null);

            var popupEl = e.popup.getElement();
            var btn = popupEl ? popupEl.querySelector('[data-temp-add]') : null;
            if (btn) {
                btn.addEventListener('click', function () {
                    openLocationForm('add', {
                        lat: lat,
                        lng: lng,
                        title: label ? label.split(',')[0] : ''
                    });
                });
            }
        });
    }

    function clearTempSearchMarker() {
        if (tempSearchMarker && map) {
            map.removeLayer(tempSearchMarker);
        }
        tempSearchMarker = null;
    }

    function closeSearchResults(clearContent) {
        var resultsEl = document.getElementById('map-search-results');
        if (!resultsEl) return;
        resultsEl.classList.remove('is-active');
        if (clearContent) resultsEl.innerHTML = '';
    }

    function toggleClearButton(value) {
        var clearBtn = document.getElementById('map-search-clear');
        if (clearBtn) clearBtn.style.display = value ? 'flex' : 'none';
    }

    function ensureSearchBox() {
        var existing = document.getElementById('map-search-box');
        if (existing) return existing;

        var mapEl = document.getElementById('investment-map');
        if (!mapEl || !mapEl.parentNode) return null;

        var box = document.createElement('div');
        box.id = 'map-search-box';
        box.className = 'map-search-box';
        box.innerHTML =
            '<div class="map-search-input-wrap">' +
                '<i class="fa-solid fa-magnifying-glass"></i>' +
                '<input type="text" id="map-search-input" class="map-search-input" ' +
                    'placeholder="Cari nama lokasi, alamat, atau koordinat (lat, lng)..." ' +
                    'aria-label="Cari lokasi" autocomplete="off">' +
                '<button type="button" class="map-search-clear" id="map-search-clear" aria-label="Bersihkan pencarian" style="display:none;">' +
                    '<i class="fa-solid fa-xmark"></i>' +
                '</button>' +
            '</div>' +
            '<div class="map-search-results" id="map-search-results"></div>';

        mapEl.parentNode.insertBefore(box, mapEl.nextSibling);
        return box;
    }

    function setupSearchBox() {
        if (!map) return; // peta gagal termuat (mis. Leaflet belum ada) -- jangan pasang UI cari
        var box = ensureSearchBox();
        if (!box) return;

        var input = document.getElementById('map-search-input');
        var clearBtn = document.getElementById('map-search-clear');
        if (!input) return;

        input.addEventListener('input', function (e) {
            var val = e.target.value;
            toggleClearButton(val);
            if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(function () {
                performSearch(val);
            }, 350);
        });

        input.addEventListener('focus', function () {
            var resultsEl = document.getElementById('map-search-results');
            if (resultsEl && resultsEl.innerHTML.trim() && input.value.trim()) {
                resultsEl.classList.add('is-active');
            }
        });

        input.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                closeSearchResults(false);
                input.blur();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                var firstItem = document.querySelector('#map-search-results .map-search-item');
                if (firstItem) firstItem.click();
            }
        });

        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                input.value = '';
                toggleClearButton('');
                closeSearchResults(true);
                clearTempSearchMarker();
                if (searchAbortController) searchAbortController.abort();
                input.focus();
            });
        }

        document.addEventListener('click', function (e) {
            var currentBox = document.getElementById('map-search-box');
            if (currentBox && !currentBox.contains(e.target)) {
                closeSearchResults(false);
            }
        });
    }

    /* ================================================================
       FITUR RUTE PERJALANAN
       ================================================================
       Dipicu dari tombol "Rute ke Sini" di popup marker mana pun
       (lihat popupHtml/tempPopupHtml + bindRouteButtonInPopup). Alur:

         startRouteTo(lat, lng, label)
           -> minta lokasi pengguna lewat navigator.geolocation
           -> placeUserLocationMarker() gambar titik biru "Anda di sini"
           -> fetchRoute() panggil OSRM buat hitung rute
           -> drawRoute() gambar polyline + tampilkan panel info

       routeRequestId dipakai buat "membatalkan" hasil geolocation/fetch
       yang telat datang (mis. pengguna keburu klik "Batalkan Rute" atau
       minta rute ke tujuan lain sebelum request sebelumnya selesai).
       ================================================================ */

    function placeUserLocationMarker(lat, lng) {
        if (!map) return;
        if (userLocationMarker) {
            userLocationMarker.setLatLng([lat, lng]);
        } else {
            userLocationMarker = L.marker([lat, lng], {
                icon: buildUserLocationIcon(),
                zIndexOffset: 1000,
                interactive: false,
                keyboard: false
            }).addTo(map);
        }
    }

    function geolocationErrorMessage(err) {
        if (err && err.code === 1) return 'Izin lokasi ditolak. Aktifkan izin lokasi di browser untuk memakai fitur rute.';
        if (err && err.code === 2) return 'Lokasi Anda tidak dapat dideteksi saat ini. Pastikan GPS/lokasi perangkat aktif.';
        if (err && err.code === 3) return 'Waktu deteksi lokasi habis. Coba lagi.';
        return 'Gagal mendapatkan lokasi Anda.';
    }

    function formatDuration(seconds) {
        var totalMin = Math.max(1, Math.round(seconds / 60));
        if (totalMin < 60) return totalMin + ' menit';
        var h = Math.floor(totalMin / 60);
        var m = totalMin % 60;
        return h + ' jam' + (m ? ' ' + m + ' menit' : '');
    }

    function startRouteTo(lat, lng, label) {
        if (!map) return;

        routeRequestId += 1;
        var requestId = routeRequestId;
        routeDestination = { lat: lat, lng: lng, label: label || null };
        clearRouteLine();
        showRoutePanel({ loading: true, stage: 'locating' });

        if (!('geolocation' in navigator)) {
            showRoutePanel({ error: 'Perangkat/browser ini tidak mendukung deteksi lokasi.' });
            return;
        }

        navigator.geolocation.getCurrentPosition(
            function (pos) {
                if (requestId !== routeRequestId) return; // sudah dibatalkan / diganti rute baru
                var userLat = pos.coords.latitude;
                var userLng = pos.coords.longitude;
                placeUserLocationMarker(userLat, userLng);
                showRoutePanel({ loading: true, stage: 'routing' });
                fetchRoute(userLat, userLng, lat, lng, label, requestId);
            },
            function (err) {
                if (requestId !== routeRequestId) return;
                showRoutePanel({ error: geolocationErrorMessage(err) });
            },
            { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
        );
    }

    function fetchRoute(userLat, userLng, destLat, destLng, destLabel, requestId) {
        if (routeAbortController) routeAbortController.abort();
        routeAbortController = new AbortController();

        var url = OSRM_BASE_URL + userLng + ',' + userLat + ';' + destLng + ',' + destLat +
            '?overview=full&geometries=geojson';

        fetch(url, { signal: routeAbortController.signal })
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (requestId !== routeRequestId) return;
                if (!data || data.code !== 'Ok' || !data.routes || !data.routes.length) {
                    throw new Error('NO_ROUTE');
                }
                drawRoute(data.routes[0], destLabel);
            })
            .catch(function (err) {
                if (requestId !== routeRequestId) return;
                if (err && err.name === 'AbortError') return;
                var msg = (err && err.message === 'NO_ROUTE')
                    ? 'Rute tidak ditemukan antara lokasi Anda dan tujuan ini.'
                    : 'Gagal menghitung rute. Server rute demo (OSRM) mungkin sedang sibuk -- coba lagi sebentar lagi.';
                showRoutePanel({ error: msg });
            });
    }

    function drawRoute(route, destLabel) {
        clearRouteLine();

        var latlngs = route.geometry.coordinates.map(function (c) { return [c[1], c[0]]; });

        routeLayerGroup = L.layerGroup().addTo(map);
        // Garis halo putih di bawah supaya rute terlihat "menyala" di
        // atas tile peta yang terang, baru garis birunya di atasnya.
        L.polyline(latlngs, { color: '#ffffff', weight: 7, opacity: 0.9, lineJoin: 'round', lineCap: 'round' }).addTo(routeLayerGroup);
        L.polyline(latlngs, { color: '#1f4e8c', weight: 4.5, opacity: 0.95, lineJoin: 'round', lineCap: 'round' }).addTo(routeLayerGroup);

        var bounds = L.latLngBounds(latlngs);
        if (userLocationMarker) bounds.extend(userLocationMarker.getLatLng());
        map.fitBounds(bounds, { padding: [56, 56] });

        var distanceKm = route.distance / 1000;
        var distanceText = distanceKm < 10
            ? distanceKm.toFixed(1).replace('.', ',') + ' km'
            : Math.round(distanceKm) + ' km';

        showRoutePanel({
            distanceText: distanceText,
            durationText: formatDuration(route.duration),
            destLabel: destLabel
        });
    }

    function clearRouteLine() {
        if (routeLayerGroup && map) map.removeLayer(routeLayerGroup);
        routeLayerGroup = null;
    }

    function clearRoute() {
        routeRequestId += 1; // batalkan proses geolocation/fetch yang mungkin masih berjalan
        if (routeAbortController) { routeAbortController.abort(); routeAbortController = null; }
        clearRouteLine();
        if (userLocationMarker && map) map.removeLayer(userLocationMarker);
        userLocationMarker = null;
        routeDestination = null;
        hideRoutePanel();
    }

    function ensureRoutePanel() {
        var existing = document.getElementById('map-route-panel');
        if (existing) return existing;

        var mapEl = document.getElementById('investment-map');
        if (!mapEl || !mapEl.parentNode) return null;

        var panel = document.createElement('div');
        panel.id = 'map-route-panel';
        panel.className = 'map-route-panel';
        panel.innerHTML =
            '<div class="map-route-panel-head">' +
                '<i class="fa-solid fa-route"></i>' +
                '<div class="map-route-panel-title" data-route-title>Rute Perjalanan</div>' +
                '<button type="button" class="map-route-panel-close" id="map-route-close" aria-label="Tutup rute">' +
                    '<i class="fa-solid fa-xmark"></i>' +
                '</button>' +
            '</div>' +
            '<div class="map-route-panel-body" data-route-body></div>';

        mapEl.parentNode.insertBefore(panel, mapEl.nextSibling);

        panel.querySelector('#map-route-close').addEventListener('click', clearRoute);

        return panel;
    }

    function bindRouteCancelButtons(panel) {
        panel.querySelectorAll('[data-route-cancel]').forEach(function (btn) {
            btn.addEventListener('click', clearRoute);
        });
    }

    function showRoutePanel(state) {
        var panel = ensureRoutePanel();
        if (!panel) return;
        panel.classList.add('is-active');

        var titleEl = panel.querySelector('[data-route-title]');
        var bodyEl = panel.querySelector('[data-route-body]');

        if (state.error) {
            titleEl.textContent = 'Rute Gagal Dihitung';
            bodyEl.innerHTML =
                '<p class="map-route-panel-error">' + escapeHtml(state.error) + '</p>' +
                '<button type="button" class="map-route-retry-btn" data-route-retry>' +
                    '<i class="fa-solid fa-rotate-right"></i> Coba Lagi' +
                '</button>' +
                '<button type="button" class="map-route-cancel-btn" data-route-cancel>' +
                    '<i class="fa-solid fa-xmark"></i> Tutup' +
                '</button>';

            var retryBtn = panel.querySelector('[data-route-retry]');
            if (retryBtn) {
                retryBtn.addEventListener('click', function () {
                    if (routeDestination) startRouteTo(routeDestination.lat, routeDestination.lng, routeDestination.label);
                });
            }
            bindRouteCancelButtons(panel);
            return;
        }

        if (state.loading) {
            titleEl.textContent = state.stage === 'routing' ? 'Menghitung rute...' : 'Mencari lokasi Anda...';
            bodyEl.innerHTML = '<div class="map-route-panel-loading"><i class="fa-solid fa-spinner fa-spin"></i> Mohon tunggu sebentar.</div>';
            return;
        }

        titleEl.textContent = state.destLabel ? ('Rute ke ' + state.destLabel) : 'Rute Perjalanan';
        bodyEl.innerHTML =
            '<div class="map-route-stats">' +
                '<div class="map-route-stat">' +
                    '<div class="map-route-stat-value">' + escapeHtml(state.distanceText) + '</div>' +
                    '<div class="map-route-stat-label">Jarak</div>' +
                '</div>' +
                '<div class="map-route-stat">' +
                    '<div class="map-route-stat-value">' + escapeHtml(state.durationText) + '</div>' +
                    '<div class="map-route-stat-label">Estimasi (mobil)</div>' +
                '</div>' +
            '</div>' +
            '<p class="map-route-panel-note">Dihitung otomatis lewat OSRM (server demo publik) -- hanya perkiraan, bisa berbeda dari kondisi lalu lintas sebenarnya.</p>' +
            '<button type="button" class="map-route-cancel-btn" data-route-cancel>' +
                '<i class="fa-solid fa-xmark"></i> Batalkan Rute' +
            '</button>';
        bindRouteCancelButtons(panel);
    }

    function hideRoutePanel() {
        var panel = document.getElementById('map-route-panel');
        if (panel) panel.classList.remove('is-active');
    }

    // Dipanggil dari popupopen setiap marker (lokasi tersimpan MAUPUN
    // marker sementara hasil pencarian) buat mengaktifkan tombol
    // "Rute ke Sini" yang ada di dalam popup-nya.
    function bindRouteButtonInPopup(popup, lat, lng, label) {
        var popupEl = popup.getElement();
        var btn = popupEl ? popupEl.querySelector('[data-route-btn]') : null;
        if (btn) {
            btn.addEventListener('click', function () {
                startRouteTo(lat, lng, label || null);
            });
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        // Sembunyikan tombol "Kelola Lokasi" dari awal biar gak sempat
        // "kedip" kelihatan buat pengguna biasa sebelum status admin
        // dipastikan (fetch check-session butuh sedikit waktu).
        var manageBtn = document.getElementById('map-manage-btn');
        if (manageBtn) manageBtn.style.display = 'none';

        initMap();
        setupPickCancelButton();
        setupSearchBox();
        loadAdminStatus().then(function () {
            setupManageButton();
        });
    });
})();