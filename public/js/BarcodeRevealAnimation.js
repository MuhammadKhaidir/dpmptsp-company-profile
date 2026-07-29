// BarcodeRevealAnimation.js
// Kelas buat generate + nampilin "kode verifikasi" barcode ACAK di bawah
// section Visi & Misi, dengan animasi ngumpul dari pecahan (bukan cuma fade biasa).
//
// SENGAJA gak pakai [data-reveal] / observer dari SectionRevealAnimation.js --
// barcode ini punya IntersectionObserver SENDIRI biar animasi assemble-nya gak
// numpuk/rebutan sama observer wipe-box section. Elemen `.barcode-panel` cuma
// duduk di atas wipe-layer (z-index lebih tinggi), gak ikut logic wipe itu.
//
// Alurnya tiap kali section kelihatan:
//   1. generateModules() + generateDigits() -> bikin pola bar & angka baru
//   2. build() -> render tiap batang sebagai <rect> di posisi FINAL-nya,
//      tapi dikasih transform awal ACAK (mencar jauh, muter, ngecil, transparan)
//      lewat inline style
//   3. play() -> paksa browser commit posisi acak itu dulu (reflow), baru
//      lepas transform satu-satu dengan urutan DIACAK (assembleOrder) + delay
//      bertahap, biar keliatan "berhamburan lalu nyusun sendiri" bukan baris
//      per baris yang mekanis
//   4. begitu batang terakhir kelar ngumpul -> garis scan nyapu + glow pulse,
//      abis itu digit angka muncul huruf demi huruf
//
// REPLAY: discroll keluar terus balik masuk lagi -> barcode di-generate ULANG
// (kode baru tiap kali), bukan cuma direset ke kode yang sama.
class BarcodeRevealAnimation {
    constructor(panelSelector = '#barcode-panel') {
        this.panel = document.querySelector(panelSelector);
        if (!this.panel) return;

        this.svg = this.panel.querySelector('.barcode-svg');
        this.digitsBox = this.panel.querySelector('.barcode-digits');
        this.inner = this.panel.querySelector('.barcode-panel-inner');
        if (!this.svg || !this.digitsBox || !this.inner) return;

        this.NS = 'http://www.w3.org/2000/svg';
        this.VIEW_W = 320;
        this.BAR_TOP = 8;
        this.BAR_H_NORMAL = 70; // tinggi batang biasa
        this.BAR_H_GUARD = 86;  // batang "guard" (start/tengah/akhir) dibikin lebih tinggi, kayak barcode asli

        this.playing = false;
        this.bars = [];
        this.scanTimer = null;
        this.pulseTimer = null;
        this.digitTimers = [];

        this.observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting && entry.intersectionRatio >= 0.2) {
                    if (this.playing) return;
                    this.play();
                } else if (entry.intersectionRatio < 0.2) {
                    if (!this.playing) return;
                    this.reset();
                }
            });
        }, { threshold: [0, 0.2] });

        this.observer.observe(this.panel);
    }

    // ── modul bar acak, guard bar dipaksa polanya biar mirip EAN-13 asli ──
    generateModules() {
        const modules = [];
        const RUN_HALF = 35; // jumlah modul acak di tiap blok kiri/kanan

        const pushGuard = (pattern) => pattern.forEach((v) => modules.push({ v, guard: true }));
        const pushRun = (count) => {
            let value = Math.round(Math.random());
            let made = 0;
            while (made < count) {
                const runLen = Math.min(count - made, 1 + Math.floor(Math.random() * 3));
                for (let i = 0; i < runLen; i++) modules.push({ v: value, guard: false });
                made += runLen;
                value = 1 - value;
            }
        };

        pushGuard([1, 0, 1]);       // start guard
        pushRun(RUN_HALF);          // blok kiri acak
        pushGuard([0, 1, 0, 1, 0]); // middle guard
        pushRun(RUN_HALF);          // blok kanan acak
        pushGuard([1, 0, 1]);       // end guard

        return modules;
    }

    // ── 13 digit ala EAN-13 (12 acak + 1 checksum asli, biar keliatan valid) ──
    generateDigits() {
        let digits = '';
        for (let i = 0; i < 12; i++) digits += Math.floor(Math.random() * 10);

        let sum = 0;
        for (let i = 0; i < 12; i++) {
            const d = parseInt(digits[i], 10);
            sum += (i % 2 === 0) ? d : d * 3;
        }
        const check = (10 - (sum % 10)) % 10;
        return digits + check;
    }

    // ── bikin ulang isi SVG + digit dari nol (dipanggil tiap play(), biar tiap muncul beda) ──
    build() {
        this.svg.innerHTML = '';
        this.digitsBox.innerHTML = '';

        const modules = this.generateModules();
        const moduleW = (this.VIEW_W - 16) / modules.length;

        // urutan "ngumpul" diacak (bukan urut kiri-ke-kanan), biar kesan
        // berhamburan lalu nyusun sendiri -- bukan animasi baris yang
        // keliatan mekanis/dibaca satu-satu
        const assembleOrder = modules.map((_, i) => i);
        for (let i = assembleOrder.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [assembleOrder[i], assembleOrder[j]] = [assembleOrder[j], assembleOrder[i]];
        }
        const orderIndex = new Array(modules.length);
        assembleOrder.forEach((moduleIdx, order) => { orderIndex[moduleIdx] = order; });

        this.bars = [];
        let x = 8;
        modules.forEach((mod, i) => {
            if (mod.v === 1) {
                const h = mod.guard ? this.BAR_H_GUARD : this.BAR_H_NORMAL;
                const y = this.BAR_TOP + (this.BAR_H_GUARD - h);

                const rect = document.createElementNS(this.NS, 'rect');
                rect.setAttribute('x', x.toFixed(2));
                rect.setAttribute('y', y.toFixed(2));
                rect.setAttribute('width', Math.max(moduleW - 0.3, 0.6).toFixed(2));
                rect.setAttribute('height', h.toFixed(2));
                rect.style.transformBox = 'fill-box';
                rect.style.transformOrigin = 'center';

                // posisi acak "sebelum ngumpul": mencar jauh dari titik final,
                // muter, ngecil, transparan
                const fx = (Math.random() * 2 - 1) * 260;
                const fy = (Math.random() * 2 - 1) * 160;
                const frot = (Math.random() * 2 - 1) * 200;
                rect.style.transform = `translate(${fx}px, ${fy}px) rotate(${frot}deg) scale(.25)`;
                rect.style.opacity = '0';
                rect.style.transition = 'none';

                this.svg.appendChild(rect);
                this.bars.push({ el: rect, order: orderIndex[i] });
            }
            x += moduleW;
        });

        // digit di bawah, tiap karakter jadi span sendiri biar bisa muncul satu-satu
        const digitStr = this.generateDigits();
        [...digitStr].forEach((ch) => {
            const span = document.createElement('span');
            span.className = 'bd-char';
            span.textContent = ch;
            this.digitsBox.appendChild(span);
        });
    }

    play() {
        this.playing = true;
        this.build();

        const BAR_STAGGER = 0.012;  // jeda antar batang pas ngumpul (detik)
        const BAR_DURATION = 0.55;
        const barsCount = this.bars.length;

        // paksa browser commit posisi acak awal dulu (reflow), biar transisi
        // di bawah beneran keliatan animasi DARI kondisi tercerai-berai itu --
        // bukan langsung "teleport" ke posisi akhir tanpa gerak sama sekali
        void this.svg.offsetWidth;

        requestAnimationFrame(() => {
            this.bars.forEach(({ el, order }) => {
                const delay = (order * BAR_STAGGER).toFixed(3);
                el.style.transition =
                    `transform ${BAR_DURATION}s cubic-bezier(.22,1.5,.4,1) ${delay}s, ` +
                    `opacity ${(BAR_DURATION * 0.5).toFixed(2)}s ease ${delay}s`;
                el.style.transform = 'translate(0,0) rotate(0deg) scale(1)';
                el.style.opacity = '1';
            });
        });

        const totalAssembleMs = (barsCount * BAR_STAGGER + BAR_DURATION) * 1000;

        // ── abis semua batang kelar ngumpul: scan line + glow pulse, baru digit muncul ──
        this.scanTimer = setTimeout(() => {
            const scanLine = document.createElement('div');
            scanLine.className = 'barcode-scan-line sweep';
            this.inner.appendChild(scanLine);
            this.inner.classList.add('verified-pulse');

            this.pulseTimer = setTimeout(() => this.inner.classList.remove('verified-pulse'), 650);
            scanLine.addEventListener('animationend', () => scanLine.remove());

            const chars = this.digitsBox.querySelectorAll('.bd-char');
            chars.forEach((span, i) => {
                this.digitTimers.push(setTimeout(() => span.classList.add('in'), i * 28));
            });
        }, totalAssembleMs);
    }

    reset() {
        this.playing = false;
        clearTimeout(this.scanTimer);
        clearTimeout(this.pulseTimer);
        this.digitTimers.forEach(clearTimeout);
        this.digitTimers = [];

        this.inner.classList.remove('verified-pulse');
        const existingScan = this.inner.querySelector('.barcode-scan-line');
        if (existingScan) existingScan.remove();
        // svg/digits SENGAJA gak langsung dikosongin di sini -- biar gak "kedip"
        // pas batas viewport lagi pas-pasan. build() bakal generate + timpa ulang
        // otomatis begitu play() berikutnya jalan (pas balik masuk viewport).
    }
}

new BarcodeRevealAnimation('#barcode-panel');