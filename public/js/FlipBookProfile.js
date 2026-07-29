/**
 * FlipBookProfile.js
 * Builds and drives the "Company Profile" interactive book carousel.
 */
(function () {
    var BOOKS = [
        {
            title: 'Profil Perusahaan',
            spine: 'PROFIL DPMPTSP',
            sub: 'Company Profile',
            pages: [
                { eyebrow: 'Sejarah', h2: 'Perjalanan Kami', p: 'DPMPTSP dibentuk untuk menyatukan seluruh proses perizinan kota dalam satu pintu layanan, menggantikan alur yang dulunya tersebar di banyak dinas.' },
                { eyebrow: 'Struktur', h2: 'Organisasi Layanan', p: 'Setiap bidang — perizinan, pengaduan, dan investasi — bekerja dalam satu koordinasi agar respons ke masyarakat lebih cepat dan konsisten.' },
                { eyebrow: 'Jangkauan', h2: 'Wilayah Layanan', p: 'Loket fisik dan layanan daring kami menjangkau seluruh kecamatan di kota, dengan waktu proses yang dipantau secara terbuka.' },
                { eyebrow: 'Nilai', h2: 'Yang Kami Pegang', p: 'Transparansi, kecepatan, dan akuntabilitas adalah tiga hal yang kami jadikan ukuran keberhasilan setiap layanan.' }
            ]
        },
        {
            title: 'Laporan Kinerja',
            spine: 'LAPORAN TAHUNAN',
            sub: 'Ringkasan 2025 / 2026',
            pages: [
                { eyebrow: 'Capaian', h2: 'Ringkasan 2025', p: 'Waktu proses rata-rata perizinan turun dibanding tahun sebelumnya, seiring digitalisasi alur pengajuan berkas.' },
                { eyebrow: 'Statistik', h2: 'Volume Perizinan', p: 'Permohonan NIB dan izin usaha mikro mendominasi jumlah pengajuan, disusul izin bangunan dan lingkungan.' },
                { eyebrow: 'Pengaduan', h2: 'Tindak Lanjut', p: 'Mayoritas laporan masyarakat ditindaklanjuti dalam hitungan hari kerja, dengan status yang dapat dipantau langsung oleh pelapor.' },
                { eyebrow: 'Rencana', h2: 'Fokus 2026', p: 'Perluasan layanan mandiri lewat terminal swalayan dan penyederhanaan berkas menjadi prioritas tahun berjalan.' }
            ]
        },
        {
            title: 'Panduan Layanan',
            spine: 'PANDUAN PUBLIK',
            sub: 'Untuk Masyarakat',
            pages: [
                { eyebrow: 'Langkah 1', h2: 'Ajukan Pengaduan', p: 'Masuk ke akun masyarakat, pilih "Buat Pengaduan", dan lengkapi kronologi beserta bukti pendukung bila ada.' },
                { eyebrow: 'Langkah 2', h2: 'Pantau Status', p: 'Setiap laporan mendapat nomor tiket dan status berjalan: Diproses, Selesai, atau Ditolak beserta alasannya.' },
                { eyebrow: 'Perizinan', h2: 'Jenis Layanan', p: 'Perizinan usaha, bangunan, dan non-perizinan lain dapat diajukan lewat sistem yang sama dengan alur yang seragam.' },
                { eyebrow: 'Kontak', h2: 'Butuh Bantuan?', p: 'Gunakan asisten obrolan di pojok kiri bawah layar, atau kunjungi loket pada jam kerja untuk bantuan langsung.' }
            ]
        }
    ];

    var THICKNESS = 44;     // px — perceived depth of the closed book box
    var FAN_ANGLE = 11;     // (Diabaikan karena diganti dengan susunan tumpuk menyamping)
    var SIDE_SCALE = 0.9;   // scale applied to non-active books
    var MAX_VISIBLE_REL = 2; // how many steps away from active are still shown

    function buildCoverFace(className, book, isSpine, isBack) {
        var el = document.createElement('div');
        el.className = 'fb-cbf ' + className;
        if (isSpine) {
            el.innerHTML = '<span class="fb-spine-label"></span>';
            el.querySelector('.fb-spine-label').textContent = book.spine;
        } else if (className.indexOf('fb-cbf-fore') !== -1 || className.indexOf('fb-cbf-top') !== -1 || className.indexOf('fb-cbf-bottom') !== -1) {
            // plain textured edge faces — no content needed
        } else {
            var mark = document.createElement('div');
            mark.className = 'fb-mark';
            mark.textContent = 'DP';
            var rule = document.createElement('div');
            rule.className = 'fb-rule';
            var h1 = document.createElement('h1');
            h1.textContent = isBack ? book.sub : book.title;
            var small = document.createElement('small');
            small.textContent = isBack ? 'DPMPTSP Kota Palembang' : book.sub;
            el.appendChild(mark);
            el.appendChild(rule);
            el.appendChild(h1);
            el.appendChild(small);
        }
        return el;
    }

    function buildPageFace(page, pageNumber, isBlank) {
        var face = document.createElement('div');
        face.className = 'fb-face' + (isBlank ? ' fb-blank-face' : '');
        if (isBlank || !page) {
            var p = document.createElement('p');
            p.textContent = 'Halaman ini sengaja dikosongkan';
            face.appendChild(p);
            return face;
        }
        var eyebrow = document.createElement('p');
        eyebrow.className = 'fb-eyebrow';
        eyebrow.textContent = page.eyebrow;
        var h2 = document.createElement('h2');
        h2.textContent = page.h2;
        var body = document.createElement('p');
        body.textContent = page.p;
        var pnum = document.createElement('span');
        pnum.className = 'fb-pnum';
        pnum.textContent = String(pageNumber).padStart(2, '0');
        face.appendChild(eyebrow);
        face.appendChild(h2);
        face.appendChild(body);
        face.appendChild(pnum);
        return face;
    }

    function setFaceGeometry(el, w, h, t, kind) {
        el.style.position = 'absolute';
        el.style.top = 'auto'; el.style.left = 'auto'; el.style.right = 'auto'; el.style.bottom = 'auto';
        var transform = '';
        switch (kind) {
            case 'front':
                el.style.width = w + 'px'; el.style.height = h + 'px'; el.style.left = '0'; el.style.top = '0';
                transform = 'translateZ(' + (t / 2) + 'px)';
                break;
            case 'back':
                el.style.width = w + 'px'; el.style.height = h + 'px'; el.style.left = '0'; el.style.top = '0';
                transform = 'rotateY(180deg) translateZ(' + (t / 2) + 'px)';
                break;
            case 'spine':
                el.style.width = t + 'px'; el.style.height = h + 'px'; el.style.left = '0'; el.style.top = '0';
                transform = 'rotateY(-90deg) translateZ(' + (w / 2) + 'px)';
                break;
            case 'fore':
                el.style.width = t + 'px'; el.style.height = h + 'px'; el.style.left = '0'; el.style.top = '0';
                transform = 'rotateY(90deg) translateZ(' + (w / 2) + 'px)';
                break;
            case 'top':
                el.style.width = w + 'px'; el.style.height = t + 'px'; el.style.left = '0'; el.style.top = '0';
                transform = 'rotateX(90deg) translateZ(' + (h / 2) + 'px)';
                break;
            case 'bottom':
                el.style.width = w + 'px'; el.style.height = t + 'px'; el.style.left = '0'; el.style.top = '0';
                transform = 'rotateX(-90deg) translateZ(' + (h / 2) + 'px)';
                break;
        }
        el.style.transform = transform;
    }

    function buildBook(wrapEl, book, controlsEl, opts) {
        opts = opts || {};
        var getIsActive = opts.getIsActive || function () { return true; };
        var onOpenChange = opts.onOpenChange || function () {};

        wrapEl.innerHTML = '';
        var ground = document.createElement('div');
        ground.className = 'fb-ground-shadow';
        var base = document.createElement('div');
        base.className = 'fb-book-base';
        var closed = document.createElement('div');
        closed.className = 'fb-closed-box';
        var openSpread = document.createElement('div');
        openSpread.className = 'fb-open-spread';
        var bookEl = document.createElement('div');
        bookEl.className = 'fb-book';
        openSpread.appendChild(bookEl);

        wrapEl.appendChild(ground);
        wrapEl.appendChild(base);
        wrapEl.appendChild(closed);
        wrapEl.appendChild(openSpread);

        var front = buildCoverFace('fb-cbf-front', book, false, false);
        var back = buildCoverFace('fb-cbf-back', book, false, true);
        var spine = buildCoverFace('fb-cbf-spine', book, true, false);
        var fore = buildCoverFace('fb-cbf-fore', book, false, false);
        var top = buildCoverFace('fb-cbf-top', book, false, false);
        var bottom = buildCoverFace('fb-cbf-bottom', book, false, false);
        closed.appendChild(front); closed.appendChild(back); closed.appendChild(spine);
        closed.appendChild(fore); closed.appendChild(top); closed.appendChild(bottom);

        var pages = book.pages;
        var sheetCount = Math.ceil(pages.length / 2) + 1;
        var sheets = [];
        for (var s = 0; s < sheetCount; s++) {
            var sheet = document.createElement('div');
            sheet.className = 'fb-sheet';
            var frontPage = pages[s * 2] || null;
            var backPage = pages[s * 2 + 1] || null;
            var faceFront = buildPageFace(frontPage, s * 2 + 1, !frontPage);
            var faceBack = buildPageFace(backPage, s * 2 + 2, !backPage);
            faceBack.classList.add('fb-side-back');
            sheet.appendChild(faceFront);
            sheet.appendChild(faceBack);
            bookEl.appendChild(sheet);
            sheets.push(sheet);
        }

        var closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'fb-close-btn';
        closeBtn.setAttribute('aria-label', 'Tutup buku');
        closeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        closeBtn.style.display = 'none';
        openSpread.appendChild(closeBtn);

        var state = {
            wrap: wrapEl,
            closed: closed,
            currentPage: 0,
            totalSheets: sheets.length,
            sheets: sheets,
            dragging: false,
            startX: 0,
            lastRotation: 0,
            isOpen: false,
            // MODIFIKASI: Menambahkan pemicu openBook agar bisa dibuka otomatis oleh klik carousel
            openBook: function() { setOpen(true); } 
        };

        function layout() {
            var rect = wrapEl.getBoundingClientRect();
            var w = Math.max(rect.width / 2, 80);
            var h = Math.max(rect.height, 80);
            setFaceGeometry(front, w, h, THICKNESS, 'front');
            setFaceGeometry(back, w, h, THICKNESS, 'back');
            setFaceGeometry(spine, w, h, THICKNESS, 'spine');
            setFaceGeometry(fore, w, h, THICKNESS, 'fore');
            setFaceGeometry(top, w, h, THICKNESS, 'top');
            setFaceGeometry(bottom, w, h, THICKNESS, 'bottom');
        }
        layout();
        window.addEventListener('resize', layout);

        function updateSheetStacking() {
            state.sheets.forEach(function (sheet, i) {
                var flipped = i < state.currentPage;
                sheet.style.transform = flipped ? 'rotateY(-180deg)' : 'rotateY(0deg)';
                sheet.style.zIndex = flipped ? i : (state.totalSheets - i);
            });
            var prevBtn = controlsEl.querySelector('[data-prev]');
            var nextBtn = controlsEl.querySelector('[data-next]');
            if (prevBtn) prevBtn.disabled = state.currentPage <= 0;
            if (nextBtn) nextBtn.disabled = state.currentPage >= state.totalSheets;
        }
        updateSheetStacking();

        function setOpen(open) {
            state.isOpen = open;
            closed.classList.add('fb-is-settling');
            closed.style.transform = 'rotateY(' + (open ? -175 : 0) + 'deg)';
            wrapEl.classList.toggle('fb-is-open', open);
            closeBtn.style.display = open ? 'flex' : 'none';
            var slot = wrapEl.closest('.fb-book-slot');
            if (slot) slot.classList.toggle('fb-book-slot--reading', open);
            setTimeout(function () { closed.classList.remove('fb-is-settling'); }, 650);
            onOpenChange(open);
        }

        closed.addEventListener('pointerdown', function (e) {
            if (state.isOpen) return;
            if (!getIsActive()) return;
            state.dragging = true;
            state.startX = e.clientX;
            closed.classList.add('fb-is-dragging');
            closed.classList.remove('fb-is-settling');
            try { closed.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
        });
        closed.addEventListener('pointermove', function (e) {
            if (!state.dragging) return;
            var delta = e.clientX - state.startX;
            var rotation = delta < 0 ? Math.max(delta * 0.6, -175) : 0;
            state.lastRotation = rotation;
            closed.style.transform = 'rotateY(' + rotation + 'deg)';
        });
        function endDrag(e) {
            if (!state.dragging) return;
            state.dragging = false;
            closed.classList.remove('fb-is-dragging');
            var dragDistance = Math.abs((e.clientX || state.startX) - state.startX);
            if (dragDistance < 6) {
                setOpen(true);
            } else {
                setOpen(Math.abs(state.lastRotation) > 85);
            }
        }
        closed.addEventListener('pointerup', endDrag);
        closed.addEventListener('pointercancel', endDrag);

        controlsEl.querySelector('[data-prev]').addEventListener('click', function () {
            if (state.currentPage <= 0) return;
            state.currentPage--;
            updateSheetStacking();
        });
        controlsEl.querySelector('[data-next]').addEventListener('click', function () {
            if (state.currentPage >= state.totalSheets) return;
            state.currentPage++;
            updateSheetStacking();
        });
        closeBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            state.currentPage = 0;
            updateSheetStacking();
            setOpen(false);
        });

        return state;
    }

    function initCarousel() {
        var track = document.getElementById('fbCarouselTrack');
        if (!track) return;
        var slots = Array.prototype.slice.call(track.querySelectorAll('.fb-book-slot'));
        if (!slots.length) return;

        var activeIndex = Math.floor(slots.length / 2);
        var bookStates = [];

        function anyOpen() {
            return bookStates.some(function (s) { return s.isOpen; });
        }

        function positionSlots(liveOffset) {
            liveOffset = liveOffset || 0;
            var open = anyOpen();
            slots.forEach(function (slot, i) {
                var rel = i - activeIndex;
                var isActive = rel === 0;
                slot.classList.toggle('fb-book-slot--active', isActive);
                if (isActive && !liveOffset) {
                    slot.classList.add('fb-book-slot--zoom');
                    setTimeout(function () { slot.classList.remove('fb-book-slot--zoom'); }, 520);
                }

                // =========================================================
                // MODIFIKASI POSISI: Bertumpuk menyamping & Keluar barisan
                // =========================================================
                var shiftX = (rel * 80) + (liveOffset * 8); // Geser horizontal
                var rotY = isActive ? 0 : (rel < 0 ? 65 : -65); // Hadap tengah/samping
                var popZ = isActive ? 150 : -50; // Buku aktif maju ke depan
                var scale = isActive ? 1 : SIDE_SCALE;
                
                slot.style.left = '50%';
                slot.style.marginLeft = (-slot.offsetWidth / 2) + 'px';
                slot.style.transform = 'translate3d(' + shiftX + 'px, 0, ' + popZ + 'px) rotateY(' + rotY + 'deg) scale(' + scale.toFixed(2) + ')';
                // =========================================================

                slot.style.zIndex = 10 - Math.abs(rel);
                slot.style.opacity = Math.abs(rel) > MAX_VISIBLE_REL ? 0 : 1;
                var interactable = Math.abs(rel) <= MAX_VISIBLE_REL && (!open || isActive);
                slot.style.pointerEvents = interactable ? 'auto' : 'none';
            });
        }

        slots.forEach(function (slot, i) {
            var mount = slot.querySelector('[data-book-mount]');
            var controls = slot.querySelector('.fb-controls');
            var book = BOOKS[i % BOOKS.length];
            var state = buildBook(mount, book, controls, {
                getIsActive: function () { return i === activeIndex; },
                onOpenChange: function () { positionSlots(); }
            });
            bookStates.push(state);

            // =========================================================
            // MODIFIKASI KLIK: Maju ke tengah, lalu BUKA otomatis
            // =========================================================
            slot.addEventListener('click', function () {
                if (anyOpen()) return;
                if (i === activeIndex) return;
                activeIndex = i;
                positionSlots();

                // Beri jeda sekitar 450ms agar buku keluar ke tengah dulu, lalu otomatis terbuka
                setTimeout(function() {
                    if (!bookStates[i].isOpen) {
                        bookStates[i].openBook();
                    }
                }, 450);
            });
            // =========================================================
        });

        // --- drag (mouse + touch, via Pointer Events) to shift the fan ---
        var drag = { active: false, startX: 0, lastDx: 0 };

        track.addEventListener('pointerdown', function (e) {
            if (anyOpen()) return;
            var cover = e.target.closest && e.target.closest('.fb-closed-box');
            if (cover) {
                var parentSlot = cover.closest('.fb-book-slot');
                if (parentSlot && parentSlot.classList.contains('fb-book-slot--active')) {
                    return; 
                }
            }
            drag.active = true;
            drag.startX = e.clientX;
            drag.lastDx = 0;
            track.classList.add('fb-carousel-track--dragging');
            slots.forEach(function (s) { s.classList.add('fb-no-transition'); });
            try { track.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
        });
        track.addEventListener('pointermove', function (e) {
            if (!drag.active) return;
            drag.lastDx = e.clientX - drag.startX;
            positionSlots(drag.lastDx * 0.12);
        });
        function endDrag() {
            if (!drag.active) return;
            drag.active = false;
            track.classList.remove('fb-carousel-track--dragging');
            var threshold = 70;
            if (drag.lastDx <= -threshold && activeIndex < slots.length - 1) activeIndex++;
            else if (drag.lastDx >= threshold && activeIndex > 0) activeIndex--;
            drag.lastDx = 0;
            slots.forEach(function (s) { s.classList.remove('fb-no-transition'); });
            positionSlots();
        }
        track.addEventListener('pointerup', endDrag);
        track.addEventListener('pointercancel', endDrag);
        track.addEventListener('pointerleave', function () { if (drag.active) endDrag(); });

        // --- scroll wheel to shift the fan ---
        var lastWheel = 0;
        track.addEventListener('wheel', function (e) {
            if (anyOpen()) return;
            var delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
            if (Math.abs(delta) < 4) return;
            e.preventDefault();
            var now = Date.now();
            if (now - lastWheel < 380) return;
            lastWheel = now;
            if (delta > 0 && activeIndex < slots.length - 1) activeIndex++;
            else if (delta < 0 && activeIndex > 0) activeIndex--;
            positionSlots();
        }, { passive: false });

        positionSlots();
        window.addEventListener('resize', function () { positionSlots(); });
    }

    function initRevealPlay() {
        var reveal = document.getElementById('fbReveal');
        if (!reveal) return;
        if (!('IntersectionObserver' in window)) { reveal.classList.add('fb-play'); return; }
        var obs = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('fb-play');
                    obs.unobserve(entry.target);
                }
            });
        }, { threshold: 0.25 });
        obs.observe(reveal);
    }

    document.addEventListener('DOMContentLoaded', function () {
        initCarousel();
        initRevealPlay();
    });
})();