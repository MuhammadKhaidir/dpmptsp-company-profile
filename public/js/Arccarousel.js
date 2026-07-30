(() => {
    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Normalisasi sudut ke rentang -180..180 (buat cari jalur putaran terpendek
    // — cuma dipakai jalur animasi manual/drag, bukan jalur setProgress).
    const normalizeAngle = (deg) => {
        let a = deg % 360;
        if (a > 180) a -= 360;
        if (a < -180) a += 360;
        return a;
    };

    // Baca angka dari CSS custom property dengan aman. PENTING: jangan pakai
    // `parseFloat(v) || fallback`, karena kalau valuenya benar-benar 0
    // (misal --arc-vertical-step: 0px), `0 || fallback` akan diam-diam balik
    // ke fallback (0 dianggap falsy di JS) — nilai 0 yang sengaja di-set jadi
    // gak pernah kepakai. Di sini kita cek NaN secara eksplisit.
    const readNum = (value, fallback) => {
        const n = parseFloat(value);
        return Number.isNaN(n) ? fallback : n;
    };

    class Arccarousel {
        constructor(root) {
            this.root = root;
            this.track = root.querySelector('[data-arc-track]');
            this.cards = Array.from(root.querySelectorAll('[data-arc-card]'));
            this.dotsWrap = root.querySelector('[data-arc-dots]');
            this.prevBtn = root.querySelector('.arc-prev');
            this.nextBtn = root.querySelector('.arc-next');
            this.count = this.cards.length;

            if (!this.track || !this.count) return;

            // perspective sudah diatur lewat CSS di .arc-track (bukan di root),
            // supaya titik pusat perspektif pas di titik anchor kartu.
            // Jangan set ulang this.root.style.perspective di sini.
            this.track.style.transformStyle = 'preserve-3d';

            // 360 dibagi rata sesuai jumlah kartu → lingkaran selalu penuh & rapi
            this.angleStep = 360 / this.count;

            this.active = 0;
            this.currentAngle = 0; // rotateY yang diterapkan ke track

            this.dragging = false;
            this.dragMoved = false;
            this.dragStartX = 0;
            this.dragStartAngle = 0;
            // derajat putar per px geser mouse/jari
            this.dragSensitivity = parseFloat(root.dataset.dragSensitivity) || 0.6;

            // FITUR BUKU: index kartu yang lagi "kebuka" (nampilin panel info +
            // tombol download). null = gak ada kartu yang lagi kebuka.
            this.flippedIndex = null;

            // FITUR BUKU: ubah tampilan tiap kartu jadi "sampul buku" (depan)
            // + "halaman info" (belakang) — dibungkus otomatis di sini, TIDAK
            // ganggu konten asli (icon/title/text apapun yang udah ada di
            // dalam [data-arc-card] dipindah apa adanya, cuma dibungkus ulang).
            this.cards.forEach((card) => this.wrapCardForBookLook(card));

            this.readTokens();
            this.buildDots();
            this.bindEvents();
            this.render(false);

            this._onResize = () => {
                this.readTokens();
                this.render(false);
            };
            window.addEventListener('resize', this._onResize, { passive: true });
        }

        // FITUR BUKU: bungkus konten kartu yang SUDAH ADA jadi struktur
        // sampul-buku (depan) + halaman-info (belakang), tanpa perlu tau
        // persis markup aslinya (icon/title/text apapun ikut aja apa adanya).
        // Idempoten (aman dipanggil ulang) lewat flag data-arc-wrapped.
        //
        // Sumber data buat panel belakang, urutan prioritas:
        // - Judul   : elemen .info-card-title yang udah ada, atau atribut
        //             data-arc-title di [data-arc-card] kalau mau dioverride.
        // - Deskripsi: elemen .info-card-text yang udah ada DIPINDAH (bukan
        //             diduplikat) ke panel belakang -- itulah "informasi"
        //             yang baru kelihatan pas kartu diklik. Kalau gak ada,
        //             coba atribut data-arc-desc.
        // - Link PDF : atribut data-arc-pdf di [data-arc-card], WAJIB diisi
        //             manual per kartu di HTML, misal:
        //             data-arc-pdf="/assets/pdf/buku-1.pdf"
        //             Kalau belum diisi, tombolnya otomatis nonaktif
        //             ("PDF belum tersedia") biar gak ada link rusak yang keklik.
        wrapCardForBookLook(card) {
            if (card.dataset.arcWrapped === '1') return;
            card.dataset.arcWrapped = '1';

            const front = document.createElement('div');
            front.className = 'arc-card-front';
            while (card.firstChild) front.appendChild(card.firstChild);

            const titleEl = front.querySelector('.info-card-title');
            const existingText = front.querySelector('.info-card-text');

            const back = document.createElement('div');
            back.className = 'arc-card-back';

            const backKicker = document.createElement('p');
            backKicker.className = 'arc-card-back-kicker';
            backKicker.textContent = 'Info Selengkapnya';
            back.appendChild(backKicker);

            const backHeading = document.createElement('h4');
            backHeading.className = 'arc-card-back-heading';
            backHeading.textContent = card.dataset.arcTitle || (titleEl ? titleEl.textContent : '');
            back.appendChild(backHeading);

            if (existingText) {
                // Dipindah (bukan clone) biar markup/format aslinya kebawa persis.
                existingText.classList.add('arc-card-back-desc');
                back.appendChild(existingText);
            } else if (card.dataset.arcDesc) {
                const p = document.createElement('p');
                p.className = 'arc-card-back-desc';
                p.textContent = card.dataset.arcDesc;
                back.appendChild(p);
            }

            const pdfUrl = card.dataset.arcPdf || '';
            const downloadEl = document.createElement(pdfUrl ? 'a' : 'span');
            downloadEl.className = pdfUrl ? 'arc-card-download' : 'arc-card-download is-disabled';
            downloadEl.textContent = pdfUrl ? 'Unduh PDF' : 'PDF belum tersedia';
            if (pdfUrl) {
                downloadEl.href = pdfUrl;
                downloadEl.setAttribute('download', '');
                downloadEl.target = '_blank';
                downloadEl.rel = 'noopener';
                // stopPropagation: biar klik link gak ikut kehitung sebagai
                // "klik kartu" yang nutup panel info (lihat bindEvents()).
                downloadEl.addEventListener('click', (e) => e.stopPropagation());
            }
            back.appendChild(downloadEl);

            const closeHint = document.createElement('p');
            closeHint.className = 'arc-card-back-hint';
            closeHint.textContent = 'Klik kartu untuk tutup';
            back.appendChild(closeHint);

            const hint = document.createElement('p');
            hint.className = 'arc-card-hint';
            hint.textContent = 'Klik untuk lihat info';
            front.appendChild(hint);

            const spine = document.createElement('div');
            spine.className = 'arc-card-spine';

            const inner = document.createElement('div');
            inner.className = 'arc-card-inner';
            inner.appendChild(front);
            inner.appendChild(back);

            card.appendChild(spine);
            card.appendChild(inner);
        }

        readTokens() {
            const cs = getComputedStyle(this.root);
            this.radius = readNum(cs.getPropertyValue('--arc-radius'), 340);
            this.minScale = readNum(cs.getPropertyValue('--arc-min-scale'), 0.72);
            this.minOpacity = readNum(cs.getPropertyValue('--arc-min-opacity'), 0.12);
            // Seberapa jauh tiap kartu "naik/turun anak tangga" per index, dan
            // seberapa jauh KAMERA (track) ngikutin turun/naik ke arah
            // sebaliknya per index kartu aktif. Default 0 = efek staircase +
            // camera-follow nonaktif (balik ke versi lama, sejajar/flat).
            this.verticalStep = readNum(cs.getPropertyValue('--arc-vertical-step'), 0);
        }

        buildDots() {
            if (!this.dotsWrap) return;
            this.dotsWrap.innerHTML = '';
            this.dots = this.cards.map((_, i) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'arc-dot';
                b.setAttribute('aria-label', `Ke kartu ${i + 1} dari ${this.count}`);
                b.addEventListener('click', () => this.goTo(i));
                this.dotsWrap.appendChild(b);
                return b;
            });
        }

        bindEvents() {
            // Drag/swipe manual — TIDAK bentrok sama scroll halaman karena ini
            // pointer event (klik-tahan-geser), bukan wheel/scroll.
            this.track.addEventListener('pointerdown', (e) => this.onPointerDown(e));
            window.addEventListener('pointermove', (e) => this.onPointerMove(e));
            window.addEventListener('pointerup', () => this.onPointerUp());
            window.addEventListener('pointercancel', () => this.onPointerUp());

            this.cards.forEach((card, i) => {
                card.addEventListener('click', () => {
                    if (this.dragMoved) return;
                    if (i !== this.active) {
                        this.goTo(i);
                        return;
                    }
                    // FITUR BUKU: klik kartu yang LAGI AKTIF (bukan pindah
                    // kartu) -- buka/tutup panel info + tombol download.
                    this.toggleFlip(i);
                });
            });

            if (this.prevBtn) this.prevBtn.addEventListener('click', () => this.goTo(this.active - 1));
            if (this.nextBtn) this.nextBtn.addEventListener('click', () => this.goTo(this.active + 1));

            if (!this.root.hasAttribute('tabindex')) this.root.setAttribute('tabindex', '0');
            this.root.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowLeft') { e.preventDefault(); this.goTo(this.active - 1); }
                if (e.key === 'ArrowRight') { e.preventDefault(); this.goTo(this.active + 1); }
            });

            // SENGAJA TIDAK ADA listener 'wheel' di sini. Lihat komen besar di
            // atas file: scroll digerakin dari luar lewat setProgress(), biar
            // nyatu sama satu-satunya sistem scroll-jack yang udah ada
            // (ScrubRevealAnimation.js), bukan bikin sistem kedua yang rebutan.
        }

        // FITUR BUKU: buka/tutup panel info kartu ke-i (toggle class
        // is-flipped di .arc-card-inner). Dipanggil cuma buat kartu yang
        // LAGI AKTIF (lihat bindEvents()).
        toggleFlip(i) {
            const card = this.cards[i];
            const inner = card && card.querySelector(':scope > .arc-card-inner');
            if (!inner) return;
            const isFlipped = inner.classList.toggle('is-flipped');
            this.flippedIndex = isFlipped ? i : null;
        }

        // FITUR BUKU: tutup paksa kartu yang lagi kebuka (dipanggil pas mau
        // pindah kartu aktif -- lewat klik kartu lain, drag, nav/dots, panah
        // keyboard, atau scroll -- biar gak ada kartu "kebuka" yang
        // ketinggalan pas udah bukan kartu aktif lagi).
        resetFlip() {
            if (this.flippedIndex === null) return;
            const card = this.cards[this.flippedIndex];
            const inner = card && card.querySelector(':scope > .arc-card-inner');
            if (inner) inner.classList.remove('is-flipped');
            this.flippedIndex = null;
        }

        onPointerDown(e) {
            this.dragging = true;
            this.dragMoved = false;
            this.dragStartX = e.clientX;
            this.dragStartAngle = this.currentAngle;
            try { this.track.setPointerCapture(e.pointerId); } catch (err) { /* no-op */ }
            this.track.classList.add('is-dragging');
        }

        onPointerMove(e) {
            if (!this.dragging) return;
            const dx = e.clientX - this.dragStartX;
            if (Math.abs(dx) > 4) {
                // Reset di sini (bukan di onPointerDown) biar klik biasa buat
                // NUTUP kartu yang lagi kebuka gak keburu ke-reset duluan
                // sebelum listener klik-nya sempet jalan.
                if (!this.dragMoved) this.resetFlip();
                this.dragMoved = true;
            }

            this.currentAngle = this.dragStartAngle + dx * this.dragSensitivity;
            this.render(false);
        }

        onPointerUp() {
            if (!this.dragging) return;
            this.dragging = false;
            this.track.classList.remove('is-dragging');

            // Snap (bulatkan) ke kartu terdekat saat dilepas
            const rawIndex = Math.round(-this.currentAngle / this.angleStep);
            this.active = ((rawIndex % this.count) + this.count) % this.count;
            this.animateTo(this.active);
        }

        goTo(index) {
            this.resetFlip();
            this.active = ((index % this.count) + this.count) % this.count;
            this.animateTo(this.active);
        }

        animateTo(target) {
            // Cari jalur putaran terpendek biar gak muter jauh muter-muter
            const targetAngle = -target * this.angleStep;
            const delta = normalizeAngle(targetAngle - this.currentAngle);
            this.currentAngle += delta;
            this.render(true);
        }

        /**
         * DIPANGGIL DARI LUAR (ScrubRevealAnimation.js) tiap ada scroll.
         * t = 0..1, dipetakan LINEAR ke index kartu 0..(count-1) — bukan
         * muter 360 penuh, karena ini satu lintasan scroll searah (bukan
         * loop). t=0 -> kartu pertama di tengah, t=1 -> kartu terakhir di
         * tengah. Kartu-kartu di antaranya ikut nangga sesuai posisi
         * pecahannya. Tidak pakai transition (render(false)) supaya posisi
         * carousel nempel presis 1:1 ke posisi scroll, tanpa delay/easing.
         */
        setProgress(t) {
            if (this.count < 2) return;
            const clamped = clamp(t, 0, 1);
            const logicalIndex = clamped * (this.count - 1);
            const newActive = Math.round(logicalIndex);

            // FITUR BUKU: kartu aktif berubah gara-gara scroll -> tutup dulu
            // kartu yang tadinya kebuka biar gak "nyangkut" kebuka pas udah
            // gak jadi kartu di tengah lagi.
            if (this.flippedIndex !== null && this.flippedIndex !== newActive) {
                this.resetFlip();
            }

            this.currentAngle = -logicalIndex * this.angleStep;
            this.active = newActive;
            this.render(false);
        }

        render(withTransition) {
            const useTransition = withTransition && !reduceMotion;

            this.track.style.transition = useTransition
                ? 'transform var(--arc-duration, 0.65s) cubic-bezier(.33,1,.4,1)'
                : 'none';

            // "index logis" saat ini — bisa pecahan (mis. 2.4) selagi
            // setProgress/drag/animasi berjalan.
            const logicalIndex = -this.currentAngle / this.angleStep;

            // Kamera (track) digeser BERLAWANAN arah sama offset per-kartu
            // di bawah (stepY = i * verticalStep), biar kartu yang lagi aktif
            // selalu balik konsisten ke tengah layar. Lihat penjelasan
            // lengkap di komen "SUSUNAN ANAK TANGGA + CAMERA FOLLOW" di atas.
            const cameraY = -logicalIndex * this.verticalStep;

            // rotateY murni memutar tiap kartu di bidang X-Z (horizontal +
            // depth) dan tidak pernah menyentuh koordinat Y, jadi translateY
            // di sini (camera-follow) aman ditumpuk tanpa mencampur Z.
            this.track.style.transform =
                `translateY(${cameraY.toFixed(2)}px) rotateY(${this.currentAngle.toFixed(2)}deg)`;

            this.cards.forEach((card, i) => {
                // sudut efektif kartu terhadap kamera (0 = paling depan, 180 = paling belakang)
                const effAngle = normalizeAngle(i * this.angleStep + this.currentAngle);
                const t = clamp(Math.abs(effAngle) / 180, 0, 1);

                const scale = 1 - t * (1 - this.minScale);
                const opacity = 1 - t * (1 - this.minOpacity);

                // Offset "anak tangga" khas kartu ini — makin besar index-nya,
                // makin turun posisinya. Digabung sama cameraY di atas, kartu
                // yang lagi aktif net-nya selalu 0 (balik ke tengah), sisanya
                // keliatan berjenjang di atas/bawah kartu aktif.
                const stepY = i * this.verticalStep;

                card.style.transition = useTransition
                    ? 'transform var(--arc-duration, 0.65s) cubic-bezier(.33,1,.4,1), opacity var(--arc-duration, 0.65s) ease'
                    : 'none';

                card.style.transform =
                    `translateY(${stepY.toFixed(2)}px) rotateY(${(i * this.angleStep).toFixed(2)}deg) translateZ(${this.radius}px) scale(${scale.toFixed(3)})`;
                card.style.opacity = opacity.toFixed(3);
                card.style.zIndex = String(Math.round(100 - t * 90));
                card.style.pointerEvents = t > 0.55 ? 'none' : 'auto';
                card.classList.toggle('is-active', i === this.active);
                card.setAttribute('aria-hidden', i === this.active ? 'false' : 'true');
            });

            if (this.dots) {
                this.dots.forEach((d, i) => d.classList.toggle('is-active', i === this.active));
            }
        }

        destroy() {
            window.removeEventListener('resize', this._onResize);
        }
    }

    const init = () => {
        document.querySelectorAll('[data-arc-carousel]').forEach((el) => {
            if (!el.__arcCarouselInstance) {
                el.__arcCarouselInstance = new Arccarousel(el);
            }
        });
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.Arccarousel = Arccarousel;
})();