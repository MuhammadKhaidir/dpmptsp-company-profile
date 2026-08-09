(function () {
    var CAT_ASSET_PATH = 'Assets/Video/';
    var CAT_IDLE_FRAME_COUNT = 8;
    var CAT_RUN_FRAME_COUNT = 8;
    var CAT_ATTACK_FRAME_COUNT = 8;
    var CAT_IDLE_FPS = 8;
    var CAT_RUN_FPS = 12;
    var CAT_ATTACK_FPS = 12;

    var SLOT_LABELS = {
        left: 'Peluang Bisnis Investasi',
        center: 'Katalog Investasi',
        right: 'Profil Investasi Kota Palembang'
    };

    // ================================================================
    // BARU: metadata "dokumen terkait" per slot, di-load dari backend
    // (data/qrDocStore.js lewat routes/qrDoc.js) -- BUKAN hardcode lagi.
    // Diisi/diubah lewat menu "Perbarui Tampilan Kode QR" (sekarang
    // gerbangnya sesi login admin, bukan password manual lagi -- lihat
    // fetchAdminStatus() & openChoiceModal() di bawah). Bentuknya:
    //   { mode: 'link' | 'pdf' | null, url: string | null, updatedAt }
    // Kalau mode-nya null / belum pernah diisi, tombol "Lihat Dokumen
    // Terkait" otomatis fallback ke perilaku lama (scroll ke flip book).
    // ================================================================
    var customDocMeta = {};

    function play(boxes) {
        boxes.forEach(function (box) {
            var scanLine = box.querySelector('.qr-scan-line');
            if (scanLine) scanLine.classList.add('sweep');
        });
        setTimeout(function () {
            boxes.forEach(function (box) { box.classList.add('verified-pulse'); });
        }, 700);
    }

    function setupReveal(panel, boxes) {
        if (!boxes.length) return;

        if (!('IntersectionObserver' in window)) {
            play(boxes);
            return;
        }

        var played = false;
        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting && !played) {
                    played = true;
                    play(boxes);
                    observer.unobserve(panel);
                }
            });
        }, { threshold: 0.4 });

        observer.observe(panel);
    }

    function setupHover(panel) {
        // Sengaja cuma BOX yang punya listener (bukan teksnya). Jadi status
        // hover 100% ngikutin kursor di area box: begitu kursor keluar dari
        // box, box langsung mengecil lagi -- walaupun kursor pindah ke area
        // teks penjelasan di sebelahnya. Teksnya cuma "penumpang", gak ikut
        // pegang status hover sama sekali.
        var slots = [
            { selector: '.qr-panel-left', hoverClass: 'is-hover-left' },
            { selector: '.qr-panel-center', hoverClass: 'is-hover-center' },
            { selector: '.qr-panel-right', hoverClass: 'is-hover-right' }
        ];

        var items = slots
            .map(function (slot) {
                return { el: panel.querySelector(slot.selector), hoverClass: slot.hoverClass };
            })
            .filter(function (item) { return !!item.el; });

        if (!items.length) return;

        var allHoverClasses = items.map(function (item) { return item.hoverClass; });

        function setHover(activeClass) {
            allHoverClasses.forEach(function (cls) {
                if (cls === activeClass) {
                    panel.classList.add(cls);
                } else {
                    panel.classList.remove(cls);
                }
            });
        }
        function clearHover() {
            allHoverClasses.forEach(function (cls) { panel.classList.remove(cls); });
        }

        items.forEach(function (item) {
            item.el.addEventListener('mouseenter', function () { setHover(item.hoverClass); });
            item.el.addEventListener('focusin', function () { setHover(item.hoverClass); });
            item.el.addEventListener('mouseleave', clearHover);
            item.el.addEventListener('focusout', clearHover);
        });
    }

    function goToFlipBook(bookIndex) {
        var inst = window.__flipBookScrollInstance;
        if (inst && typeof inst.goToBook === 'function') {
            inst.goToBook(bookIndex);
            return;
        }
        var fb = document.getElementById('flipbook-section');
        if (fb) fb.scrollIntoView({ behavior: 'smooth' });
    }

    // ================================================================
    // BARU: baca info dokumen terkait dari customDocMeta (hasil load
    // /api/qr-doc/meta), dipakai buat nentuin icon/label tombol di modal
    // pilihan, dan ke mana tombol itu ngarah pas diklik.
    // ================================================================
    function getRelatedDocInfo(slot) {
        var doc = customDocMeta[slot];
        var url = (doc && doc.url) ? doc.url : '';

        if (!url) {
            return { url: '', mode: null, icon: 'fa-book-open', label: 'Lihat Dokumen Terkait' };
        }

        var isPdf = doc.mode === 'pdf';
        return {
            url: url,
            mode: doc.mode,
            icon: isPdf ? 'fa-file-pdf' : 'fa-arrow-up-right-from-square',
            label: isPdf ? 'Lihat Dokumen PDF' : 'Kunjungi Tautan Terkait'
        };
    }

    function openRelatedDocument(slot, bookIndex) {
        var info = getRelatedDocInfo(slot);

        if (info.url) {
            // Otomatis kebuka di tab baru -- kalau linknya PDF, browser
            // bakal nampilin lewat PDF viewer bawaan; kalau website,
            // dibuka kayak tab biasa. noopener/noreferrer buat keamanan
            // standar pas buka tab baru dari link eksternal.
            window.open(info.url, '_blank', 'noopener,noreferrer');
            return;
        }

        // Belum ada dokumen terkait yang diatur buat slot ini -> fallback
        // ke perilaku lama.
        goToFlipBook(bookIndex);
    }

    function loadCustomQrDocs() {
        fetch('/api/qr-doc/meta')
            .then(function (res) { return res.ok ? res.json() : null; })
            .then(function (data) {
                if (!data || !data.success || !data.meta) return;
                customDocMeta = data.meta;
            })
            .catch(function () {
                // Backend fitur dokumen-terkait belum kepasang/offline --
                // diamkan aja, tombol otomatis fallback ke flip book.
            });
    }

    // ================================================================
    // BARU: cek status admin dari /api/auth/check-session -- pola yang
    // SAMA PERSIS kayak js/Arccarousel.js. SENGAJA di-fetch ULANG tiap
    // openChoiceModal() dipanggil (bukan dicek sekali pas halaman pertama
    // kali kebuka lalu di-cache), biar statusnya selalu akurat walau ada
    // login/logout/sesi expire di tab lain sambil orang lagi browsing --
    // modal ini jarang dibuka (cuma pas klik kotak QR), jadi biaya fetch
    // ulang tiap buka modal kecil banget dibanding manfaat akurasinya.
    // ================================================================
    function fetchAdminStatus() {
        return fetch('/api/auth/check-session')
            .then(function (res) { return res.ok ? res.json() : null; })
            .then(function (data) {
                return !!(data && data.logged_in && data.role === 'admin');
            })
            .catch(function () {
                return false;
            });
    }

    /* ================================================================
       Modal pilihan (klik box) + modal ganti gambar, latar, judul QR,
       dan dokumen terkait
       ----------------------------------------------------------------
       #qr-modal-root dibuat otomatis lewat JS (gak perlu nambah apapun
       di index.html), dipakai ulang buat kedua modal (isinya diganti
       total tiap buka modal baru).
       ================================================================ */
    function ensureQrModalRoot() {
        var root = document.getElementById('qr-modal-root');
        if (!root) {
            root = document.createElement('div');
            root.id = 'qr-modal-root';
            document.body.appendChild(root);
        }
        return root;
    }

    function closeQrModal() {
        var root = document.getElementById('qr-modal-root');
        if (root) root.innerHTML = '';
        document.removeEventListener('keydown', onEscCloseModal);
    }

    function onEscCloseModal(e) {
        if (e.key === 'Escape') closeQrModal();
    }

    function fireToast(message) {
        // Numpang ke fungsi fire() milik Alpine (lihat index.html: fire('...')
        // dipakai buat toast sukses login/registrasi/dll). Dibungkus try/catch
        // biar aman kalau somehow Alpine belum siap -- diamkan aja kalau gagal.
        try {
            var data = document.body._x_dataStack && document.body._x_dataStack[0];
            if (data && typeof data.fire === 'function') {
                data.fire(message);
            }
        } catch (err) { /* no-op */ }
    }

    function slotSelector(slot) {
        return '.qr-panel-' + slot;
    }

    function escapeHtml(str) {
        return String(str == null ? '' : str).replace(/[&<>"']/g, function (ch) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
        });
    }

    function applyCustomImage(slot, entry) {
        var panel = document.getElementById('qr-panel');
        if (!panel) return;
        var box = panel.querySelector(slotSelector(slot));
        if (!box) return;
        var img = box.querySelector('.qr-img');
        if (!img) return;
        var v = (entry && entry.updatedAt) ? entry.updatedAt : Date.now();
        img.src = '/api/qr-images/file/' + slot + '?v=' + v;
    }

    function applyCustomTitle(slot, title) {
        if (!title) return;

        var panel = document.getElementById('qr-panel');
        if (!panel) return;

        var box = panel.querySelector(slotSelector(slot));
        if (box) {
            var caption = box.querySelector('.qr-caption');
            if (caption) caption.textContent = title;
        }

        var hoverHeading = panel.querySelector('.qr-hover-text-' + slot + ' .qr-hover-text-inner h4');
        if (hoverHeading) hoverHeading.textContent = title;

        SLOT_LABELS[slot] = title;
    }

    /* ================================================================
       Gambar LATAR BELAKANG (elemen .qr-hover-bg-left/center/right yang
       muncul redup di belakang kotak saat di-hover). Ini gambar yang
       BEDA dari gambar kode QR itu sendiri, disimpan lewat endpoint
       terpisah (/api/qr-bg/...) yang didukung data/qrBgStore.js +
       routes/qrBg.js -- keduanya independen dari sistem gambar QR yang
       sudah ada, biar gak saling ganggu.

       Diterapkan lewat inline style (bukan nambah/ubah class CSS), yang
       otomatis menang atas rule .qr-hover-bg-left/center/right di CSS
       (inline style selalu lebih diprioritaskan browser). Kalau belum
       pernah di-upload custom, tampilan otomatis tetap pakai gambar
       default dari CSS seperti biasa.
       ================================================================ */
    function applyCustomBgImage(slot, entry) {
        var scene = document.getElementById('qr-scene');
        if (!scene) return;
        var bgEl = scene.querySelector('.qr-hover-bg-' + slot);
        if (!bgEl) return;
        var v = (entry && entry.updatedAt) ? entry.updatedAt : Date.now();
        bgEl.style.backgroundImage = "url('/api/qr-bg/file/" + slot + "?v=" + v + "')";
    }

    function loadCustomQrBgImages() {
        fetch('/api/qr-bg/meta')
            .then(function (res) { return res.ok ? res.json() : null; })
            .then(function (data) {
                if (!data || !data.success || !data.meta) return;
                ['left', 'center', 'right'].forEach(function (slot) {
                    var info = data.meta[slot];
                    if (info && info.hasCustom) {
                        applyCustomBgImage(slot, info);
                    }
                });
            })
            .catch(function () {
                // Backend fitur ganti-BG belum kepasang/offline -- diamkan
                // aja, front-end tetap pakai gambar latar default dari CSS.
            });
    }

    function loadCustomQrImages() {
        fetch('/api/qr-images/meta')
            .then(function (res) { return res.ok ? res.json() : null; })
            .then(function (data) {
                if (!data || !data.success || !data.meta) return;
                ['left', 'center', 'right'].forEach(function (slot) {
                    var info = data.meta[slot];
                    if (info && info.hasCustom) {
                        applyCustomImage(slot, info);
                    }
                    if (info && info.title) {
                        applyCustomTitle(slot, info.title);
                    }
                });
            })
            .catch(function () {
                // Backend fitur ganti-gambar belum kepasang/offline -- diamkan
                // aja, front-end tetap pakai gambar default dari HTML.
            });
    }

    function bindOverlayClose(root) {
        var overlay = root.querySelector('.qr-modal-overlay');
        overlay.addEventListener('click', function (e) {
            if (e.target.hasAttribute('data-qr-close')) closeQrModal();
        });
        document.addEventListener('keydown', onEscCloseModal);
    }

    // BARU: sekarang async (nunggu fetchAdminStatus() dulu) -- tombol
    // "Perbarui Tampilan Kode QR" cuma di-render ke DOM kalau isAdmin
    // true. Pengguna biasa / yang belum login CUMA lihat tombol "Lihat
    // Dokumen Terkait" & "Batal", gak ada jejak fitur edit sama sekali.
    function openChoiceModal(slot, bookIndex) {
        fetchAdminStatus().then(function (isAdmin) {
            var root = ensureQrModalRoot();
            var label = SLOT_LABELS[slot] || 'Kode QR Ini';
            var docInfo = getRelatedDocInfo(slot);

            var editButtonHtml = isAdmin
                ? '<button type="button" class="qr-modal-btn qr-modal-btn-ghost" data-action="edit">' +
                      '<i class="fa-solid fa-image"></i> Perbarui Tampilan Kode QR' +
                  '</button>'
                : '';

            root.innerHTML =
                '<div class="qr-modal-overlay" data-qr-close>' +
                    '<div class="qr-modal-box" role="dialog" aria-modal="true">' +
                        '<h3 class="qr-modal-title">' + escapeHtml(label) + '</h3>' +
                        '<p class="qr-modal-sub">Silakan pilih tindakan yang ingin dilakukan terhadap kode QR ini.</p>' +
                        '<button type="button" class="qr-modal-btn qr-modal-btn-primary" data-action="book">' +
                            '<i class="fa-solid ' + docInfo.icon + '"></i> ' + escapeHtml(docInfo.label) +
                        '</button>' +
                        editButtonHtml +
                        '<button type="button" class="qr-modal-cancel" data-qr-close>Batal</button>' +
                    '</div>' +
                '</div>';

            bindOverlayClose(root);

            root.querySelector('[data-action="book"]').addEventListener('click', function () {
                closeQrModal();
                openRelatedDocument(slot, bookIndex);
            });

            // BARU: tombol edit cuma ada di DOM kalau isAdmin true, jadi
            // query-nya perlu null-safe (gak selalu ketemu elemennya).
            var editBtn = root.querySelector('[data-action="edit"]');
            if (editBtn) {
                editBtn.addEventListener('click', function () {
                    openEditModal(slot, label);
                });
            }
        });
    }

    // BARU: field "Kata Sandi" DICABUT TOTAL -- otorisasi sekarang
    // ditentukan sesi admin yang sedang login (cookie), bukan lagi
    // password yang diketik ulang tiap kali submit. Modal ini cuma bisa
    // kebuka lewat tombol yang sendirinya udah di-gate isAdmin di
    // openChoiceModal() di atas, jadi gak perlu re-check di sini.
    function openEditModal(slot, label) {
        var root = ensureQrModalRoot();

        root.innerHTML =
            '<div class="qr-modal-overlay" data-qr-close>' +
                '<div class="qr-modal-box" role="dialog" aria-modal="true">' +
                    '<h3 class="qr-modal-title">Perbarui Kode QR — ' + escapeHtml(label) + '</h3>' +
                    '<p class="qr-modal-sub">Ubah judul, gambar kode QR, gambar latar belakang, dan/atau dokumen terkait untuk melanjutkan. Bagian yang dikosongkan tidak akan diubah.</p>' +
                    '<form class="qr-edit-form" data-qr-edit-form>' +
                        '<label class="qr-edit-label">Judul Kotak' +
                            '<input type="text" class="qr-edit-input" name="title" maxlength="80" value="' + escapeHtml(label) + '">' +
                        '</label>' +
                        '<label class="qr-edit-label">Berkas Gambar Kode QR (Format PNG, JPG, WEBP, atau GIF — Maksimal 5MB, kosongkan jika tidak ingin mengganti)' +
                            '<input type="file" class="qr-edit-input" name="image" accept="image/png,image/jpeg,image/webp,image/gif">' +
                        '</label>' +
                        '<label class="qr-edit-label">Berkas Gambar Latar Belakang (Tampil redup di belakang kotak saat di-hover — Maksimal 5MB, kosongkan jika tidak ingin mengganti)' +
                            '<input type="file" class="qr-edit-input" name="bgImage" accept="image/png,image/jpeg,image/webp,image/gif">' +
                        '</label>' +
                        '<label class="qr-edit-label">Dokumen Terkait — Tautan Website (opsional, kosongkan jika tidak ingin mengganti)' +
                            '<input type="url" class="qr-edit-input" name="docUrl" placeholder="https://...">' +
                        '</label>' +
                        '<label class="qr-edit-label">Dokumen Terkait — Berkas PDF (opsional, akan menggantikan tautan website di atas jika diisi — Maksimal 4MB)' +
                            '<input type="file" class="qr-edit-input" name="docFile" accept="application/pdf">' +
                        '</label>' +
                        '<label class="qr-edit-label" style="flex-direction:row; align-items:center; gap:8px; text-transform:none; letter-spacing:normal; font-weight:600; font-size:12.5px; color:rgba(17,17,17,.62);">' +
                            '<input type="checkbox" name="clearDoc" style="width:auto;">' +
                            'Hapus dokumen terkait yang tersimpan (kembali ke tampilan flip book)' +
                        '</label>' +
                        '<p class="qr-edit-error" data-qr-edit-error style="display:none;"></p>' +
                        '<div class="qr-edit-actions">' +
                            '<button type="button" class="qr-modal-cancel" data-qr-close>Batal</button>' +
                            '<button type="submit" class="qr-modal-btn qr-modal-btn-primary" data-qr-edit-submit>' +
                                '<i class="fa-solid fa-upload"></i> Simpan Perubahan' +
                            '</button>' +
                        '</div>' +
                    '</form>' +
                '</div>' +
            '</div>';

        bindOverlayClose(root);

        var form = root.querySelector('[data-qr-edit-form]');
        var errorEl = root.querySelector('[data-qr-edit-error]');
        var submitBtn = root.querySelector('[data-qr-edit-submit]');

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            errorEl.style.display = 'none';

            var titleVal = form.querySelector('[name="title"]').value;
            var imageInput = form.querySelector('[name="image"]');
            var bgInput = form.querySelector('[name="bgImage"]');
            var imageFile = imageInput && imageInput.files[0];
            var bgFile = bgInput && bgInput.files[0];

            var docUrlVal = form.querySelector('[name="docUrl"]').value.trim();
            var docFileInput = form.querySelector('[name="docFile"]');
            var docFile = docFileInput && docFileInput.files[0];
            var clearDocVal = form.querySelector('[name="clearDoc"]').checked;

            submitBtn.disabled = true;
            submitBtn.innerHTML = 'Sedang Menyimpan...';

            // Tahap 1: kirim judul + (opsional) gambar kode QR ke endpoint
            // yang sudah ada (/api/qr-images/:slot). Field bgImage SENGAJA
            // TIDAK ikut dikirim di request ini -- kalau ikut, endpoint ini
            // akan menolaknya karena hanya menerima satu field file
            // bernama "image".
            //
            // BARU: gak ada lagi field 'password' di FormData -- otorisasi
            // sekarang lewat cookie sesi (credentials: 'same-origin'),
            // divalidasi backend via middleware/requireAdmin.js (sama
            // persis pola-nya kayak /api/arc-carousel/book/add dkk).
            var qrFormData = new FormData();
            qrFormData.append('title', titleVal);
            if (imageFile) qrFormData.append('image', imageFile);

            fetch('/api/qr-images/' + slot, { method: 'POST', body: qrFormData, credentials: 'same-origin' })
                .then(function (res) {
                    return res.json().then(function (data) { return { ok: res.ok, data: data }; });
                })
                .then(function (result) {
                    if (!result.ok || !result.data.success) {
                        throw new Error(result.data.message || 'Gagal memperbarui kode QR.');
                    }

                    // entry sekarang punya `url`, bukan `filename`
                    var entry = result.data.entry || {};
                    if (entry.url) {
                        applyCustomImage(slot, entry);
                    }

                    if (entry.title) {
                        applyCustomTitle(slot, entry.title);
                        label = entry.title;
                    }

                    // Tahap 2 (opsional): kalau ada berkas gambar latar yang
                    // dipilih, lanjut kirim ke endpoint TERPISAH
                    // (/api/qr-bg/:slot). Dipisah jadi request sendiri
                    // karena target penyimpanannya beda (lihat
                    // routes/qrBg.js), bukan karena otorisasinya beda --
                    // dua-duanya sama-sama lewat sesi admin sekarang.
                    if (bgFile) {
                        var bgFormData = new FormData();
                        bgFormData.append('image', bgFile);

                        return fetch('/api/qr-bg/' + slot, { method: 'POST', body: bgFormData, credentials: 'same-origin' })
                            .then(function (res2) {
                                return res2.json().then(function (data2) { return { ok: res2.ok, data: data2 }; });
                            })
                            .then(function (result2) {
                                if (!result2.ok || !result2.data.success) {
                                    throw new Error(result2.data.message || 'Gagal memperbarui gambar latar.');
                                }
                                applyCustomBgImage(slot, result2.data.entry);
                            });
                    }
                })
                .then(function () {
                    // Tahap 3 (opsional): dokumen terkait -- endpoint TERPISAH
                    // lagi (/api/qr-doc/:slot). Prioritas kalau lebih dari
                    // satu field diisi bareng: hapus > upload PDF > tautan
                    // website.
                    if (clearDocVal) {
                        var clearFormData = new FormData();
                        clearFormData.append('mode', 'clear');

                        return fetch('/api/qr-doc/' + slot, { method: 'POST', body: clearFormData, credentials: 'same-origin' })
                            .then(function (res3) {
                                return res3.json().then(function (data3) { return { ok: res3.ok, data: data3 }; });
                            })
                            .then(function (result3) {
                                if (!result3.ok || !result3.data.success) {
                                    throw new Error(result3.data.message || 'Gagal menghapus dokumen terkait.');
                                }
                                customDocMeta[slot] = { mode: null, url: null, updatedAt: null };
                            });
                    }

                    if (docFile) {
                        var docFormData = new FormData();
                        docFormData.append('mode', 'pdf');
                        docFormData.append('document', docFile);

                        return fetch('/api/qr-doc/' + slot, { method: 'POST', body: docFormData, credentials: 'same-origin' })
                            .then(function (res3) {
                                return res3.json().then(function (data3) { return { ok: res3.ok, data: data3 }; });
                            })
                            .then(function (result3) {
                                if (!result3.ok || !result3.data.success) {
                                    throw new Error(result3.data.message || 'Gagal memperbarui dokumen PDF.');
                                }
                                customDocMeta[slot] = result3.data.entry || { mode: null, url: null, updatedAt: null };
                            });
                    }

                    if (docUrlVal) {
                        var linkFormData = new FormData();
                        linkFormData.append('mode', 'link');
                        linkFormData.append('url', docUrlVal);

                        return fetch('/api/qr-doc/' + slot, { method: 'POST', body: linkFormData, credentials: 'same-origin' })
                            .then(function (res3) {
                                return res3.json().then(function (data3) { return { ok: res3.ok, data: data3 }; });
                            })
                            .then(function (result3) {
                                if (!result3.ok || !result3.data.success) {
                                    throw new Error(result3.data.message || 'Gagal memperbarui tautan dokumen.');
                                }
                                customDocMeta[slot] = result3.data.entry || { mode: null, url: null, updatedAt: null };
                            });
                    }
                })
                .then(function () {
                    closeQrModal();
                    fireToast('Kode QR "' + label + '" berhasil diperbarui.');
                })
                .catch(function (err) {
                    errorEl.textContent = err.message || 'Terjadi kesalahan yang tidak diketahui.';
                    errorEl.style.display = 'block';
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fa-solid fa-upload"></i> Simpan Perubahan';
                });
        });
    }

    function setupClick(panel) {
        var mapping = [
            { selector: '.qr-panel-left', bookIndex: 0, slot: 'left' },
            { selector: '.qr-panel-center', bookIndex: 1, slot: 'center' },
            { selector: '.qr-panel-right', bookIndex: 2, slot: 'right' }
        ];

        mapping.forEach(function (item) {
            var box = panel.querySelector(item.selector);
            if (!box) return;

            box.addEventListener('click', function () {
                openChoiceModal(item.slot, item.bookIndex);
            });

            box.setAttribute('role', 'button');
            box.setAttribute('tabindex', '0');
            box.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                    e.preventDefault();
                    openChoiceModal(item.slot, item.bookIndex);
                }
            });
        });
    }

    function buildFrames(prefix, count) {
        var frames = [];
        for (var i = 1; i <= count; i++) {
            frames.push(CAT_ASSET_PATH + prefix + i + '.png');
        }
        return frames;
    }

    // ================================================================
    // FIX: stuck/macet animasi kucing pas ada interaksi lain (peta,
    // musik, fetch data, dll) -- HANYA terjadi di production (Vercel),
    // gak di localhost.
    //
    // Root cause: Image() yang dibikin lewat preload() itu gak nempel ke
    // DOM dan gak disimpen reference-nya. Browser (Chrome dkk) ngasih
    // prioritas fetch RENDAH buat gambar kayak gini. Begitu ada request
    // lain jalan bareng (load tile peta, streaming musik, fetch data),
    // browser bisa nge-CANCEL request gambar prioritas-rendah ini duluan
    // buat ngasih jalan ke request yang dianggap lebih penting -- persis
    // kayak yang kelihatan di Network tab (CatAttack1-6.png berstatus
    // "canceled"). Pas itu kejadian, <img> kucingnya ya cuma diem
    // nampilin frame terakhir yang sukses -- makanya keliatan "macet".
    //
    // Di localhost latency-nya ~0ms jadi request selalu kelar duluan
    // sebelum sempat di-cancel -- makanya normal-normal aja di situ.
    //
    // Fix: (1) kasih fetchPriority "high" biar browser gak nyepelein
    // request ini, (2) simpen reference-nya di catPreloadedImages biar
    // gak sempet di-garbage-collect, (3) auto-retry kalau ada frame yang
    // tetep gagal/ke-cancel, baik pas preload maupun pas lagi tampil
    // (self-healing, gak nyangkut permanen).
    // ================================================================
    var catPreloadedImages = [];

    function preload(frames) {
        return frames.map(function (src) {
            var img = new Image();
            img.decoding = 'async';
            try { img.fetchPriority = 'high'; } catch (e) { /* browser lama, abaikan */ }
            img.setAttribute('fetchpriority', 'high');
            img.addEventListener('error', function () {
                // Request-nya gagal/ke-cancel -- coba fetch ulang sekali
                // abis jeda dikit biar gak nyangkut permanen.
                setTimeout(function () { img.src = src; }, 300);
            }, { once: true });
            img.src = src;
            catPreloadedImages.push(img);
            return img;
        });
    }

function createFrameAnimator(imgEl, frames, fps) {
    var frameDuration = 1000 / fps;
    var rafId = null;
    var idx = 0;
    var lastFrameTime = 0;

    function tick(now) {
        if (!lastFrameTime) lastFrameTime = now;
        var elapsed = now - lastFrameTime;
        if (elapsed >= frameDuration) {
            // Kalau telat (main thread sempat sibuk), lompat ke frame yang
            // SEHARUSNYA saat ini -- bukan numpuk kayak setInterval.
            var framesToAdvance = Math.floor(elapsed / frameDuration);
            idx = (idx + framesToAdvance) % frames.length;
            imgEl.src = frames[idx];
            lastFrameTime = now - (elapsed % frameDuration);
        }
        rafId = requestAnimationFrame(tick);
    }

    function start() {
        stop();
        idx = 0;
        lastFrameTime = 0;
        imgEl.src = frames[idx];
        rafId = requestAnimationFrame(tick);
    }
    function stop() {
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
    }
    return { start: start, stop: stop };
}

    function setupCat(panel) {
        var cat = document.getElementById('qr-cat');
        if (!cat) return;

        cat.classList.remove('qr-cat');
        cat.classList.add('cat-mascot');
        if (cat.parentElement !== document.body) {
            document.body.appendChild(cat);
        }

        var imgEl = cat.querySelector('.qr-cat-frame');
        if (!imgEl) return;
        imgEl.classList.add('cat-mascot-frame');
        imgEl.decoding = 'async';
        try { imgEl.fetchPriority = 'high'; } catch (e) { /* browser lama, abaikan */ }
        imgEl.setAttribute('fetchpriority', 'high');
        imgEl.addEventListener('error', function () {
            // Frame yang lagi aktif ditampilin gagal/ke-cancel loading-nya
            // (biasanya kalah prioritas sama request lain yang jalan
            // bareng) -- coba ulang sekali abis jeda dikit biar animasi
            // gak nyangkut permanen di frame terakhir yang sempat sukses.
            var failedSrc = imgEl.src;
            setTimeout(function () { imgEl.src = failedSrc; }, 250);
        });

        var hitbox = document.createElement('div');
        hitbox.className = 'cat-hitbox';
        cat.appendChild(hitbox);

        var idleFrames = buildFrames('IdleCat', CAT_IDLE_FRAME_COUNT);
        var runFrames = buildFrames('RunCat', CAT_RUN_FRAME_COUNT);
        var attackFrames = buildFrames('CatAttack', CAT_ATTACK_FRAME_COUNT);
        preload(idleFrames.concat(runFrames, attackFrames));
        imgEl.src = idleFrames[0];

        var idleAnimator = createFrameAnimator(imgEl, idleFrames, CAT_IDLE_FPS);
        var runAnimator = createFrameAnimator(imgEl, runFrames, CAT_RUN_FPS);
        var attackAnimator = createFrameAnimator(imgEl, attackFrames, CAT_ATTACK_FPS);

        var state = 'hidden'; 
        var isAttacking = false;

        function stopAttack() {
            if (!isAttacking) return;
            isAttacking = false;
            attackAnimator.stop();
            cat.classList.remove('is-attacking');
        }

 function enterCat() {
    if (state === 'idle' || state === 'entering') return;
    state = 'entering';
    stopAttack();
    idleAnimator.stop();
    cat.classList.remove('is-hidden', 'is-running-out', 'is-idle-pose');
    cat.classList.add('is-running-in');
    runAnimator.start();

    var settled = false;
    function settle() {
        if (settled) return;
        settled = true;
        cat.removeEventListener('animationend', onEnd);
        if (state !== 'entering') return;
        state = 'idle';
        cat.classList.remove('is-running-in');
        cat.classList.add('is-idle-pose');
        runAnimator.stop();
        idleAnimator.start();
    }
    function onEnd() { settle(); }
    cat.addEventListener('animationend', onEnd, { once: true });
    // Fallback kalau animationend gak nembak (ke-interupsi transisi lain,
    // reduced-motion aktif, atau main thread lagi sibuk) -- state tetap
    // dipaksa lanjut biar gak nyangkut permanen.
    setTimeout(settle, 750);
}

function exitCat() {
    if (state === 'hidden' || state === 'exiting') return;
    state = 'exiting';
    stopAttack();
    idleAnimator.stop();
    cat.classList.remove('is-idle-pose', 'is-running-in');
    cat.classList.add('is-running-out');
    runAnimator.start();

    var settled = false;
    function settle() {
        if (settled) return;
        settled = true;
        cat.removeEventListener('animationend', onEnd);
        if (state !== 'exiting') return;
        state = 'hidden';
        cat.classList.remove('is-running-out');
        cat.classList.add('is-hidden');
        runAnimator.stop();
    }
    function onEnd() { settle(); }
    cat.addEventListener('animationend', onEnd, { once: true });
    setTimeout(settle, 800);
}

        function hideCatInstant() {
            if (state === 'hidden') return;
            state = 'hidden';
            stopAttack();
            idleAnimator.stop();
            runAnimator.stop();
            cat.classList.remove('is-idle-pose', 'is-running-in', 'is-running-out');
            cat.classList.add('is-hidden');
        }

        function enterAttack() {
            if (state !== 'idle' || isAttacking) return;
            isAttacking = true;
            idleAnimator.stop();
            cat.classList.remove('is-idle-pose');
            cat.classList.add('is-attacking');
            attackAnimator.start();
        }

        function exitAttack() {
            if (!isAttacking) return;
            isAttacking = false;
            attackAnimator.stop();
            cat.classList.remove('is-attacking');
            if (state === 'idle') {
                cat.classList.add('is-idle-pose');
                idleAnimator.start();
            }
        }

        hitbox.addEventListener('mouseenter', enterAttack);
        hitbox.addEventListener('mouseleave', exitAttack);

        if ('IntersectionObserver' in window) {
            var io = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) {
                        enterCat();
                    } else if (entry.boundingClientRect.top < 0) {
                        exitCat();
                    } else {
                        hideCatInstant();
                    }
                });
            }, { threshold: 0.35 });
            io.observe(panel);
        } else {
            cat.classList.remove('is-hidden');
            cat.classList.add('is-idle-pose');
            idleAnimator.start();
            state = 'idle';
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        var panel = document.getElementById('qr-panel');
        if (!panel) return;
        var boxes = Array.prototype.slice.call(panel.querySelectorAll('.qr-panel-inner'));

        setupReveal(panel, boxes);
        setupHover(panel);
        setupClick(panel);
        setupCat(panel);
        loadCustomQrImages();
        loadCustomQrBgImages();
        loadCustomQrDocs();
    });
})();