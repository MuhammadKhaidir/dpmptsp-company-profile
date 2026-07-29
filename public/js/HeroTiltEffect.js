/* ==========================================================================
   HERO — Tilt-Toward-Cursor Effect
   -----------------------------------------------------------------------
   Bedanya sama parallax biasa: arah "nolehnya" dihitung dari posisi mouse
   RELATIF terhadap titik tengah objek itu sendiri (getBoundingClientRect),
   bukan posisi mouse relatif ke layar. Jadi kalau mouse ada di kanan
   objek -> objek noleh ke kanan (rotateY +), kalau di kiri -> noleh kiri.
   Gerakannya di-lerp tiap frame (bukan lompat langsung) biar kesannya
   "goyang" natural, bukan patah-patah.

   Cara pasang: taruh script ini SETELAH markup hero-nya ada di DOM,
   sebelum </body>, setelah js/VideoRevealEffect.js.
   <script src="js/HeroTiltEffect.js" defer></script>
   ========================================================================== */

(function () {
    'use strict';

    const heroEl = document.querySelector('.hero');
    if (!heroEl) return;

    /* --------------------------------------------------------------------
       Konfigurasi objek yang mau di-tilt.
       - selector    : elemen targetnya (elemen DALAM parallax wrapper,
                        BUKAN wrapper -parallax-nya, biar gak rebutan
                        transform sama parallax/float animation)
       - maxTiltDeg  : maksimal derajat noleh (semakin gede = semakin dramatis)
       - perspective : jarak kamera semu, semakin kecil = efek 3D semakin kuat
       - baseTransform: transform statis yang mau dipertahankan (mis. rotate
                        awal device), digabung di depan tiap frame
       Tambah/hapus baris di sini kalau mau nge-tilt elemen lain juga
       (misalnya '.hero-title').
    -------------------------------------------------------------------- */
    const CONFIG = [
        { selector: '.hero-device',    maxTiltDeg: 14, perspective: 900, baseTransform: 'rotate(-6deg) ' },
        { selector: '.hero-logo-wrap', maxTiltDeg: 9,  perspective: 700, baseTransform: '' },
    ];

    const targets = CONFIG
        .map((cfg) => ({ ...cfg, el: heroEl.querySelector(cfg.selector) }))
        .filter((cfg) => cfg.el);

    if (!targets.length) return;

    targets.forEach((t) => {
        t.current = { rx: 0, ry: 0 };
        t.target = { rx: 0, ry: 0 };
        t.el.style.willChange = 'transform';
    });

    let mouseX = null;
    let mouseY = null;
    let isActive = false;

    heroEl.addEventListener(
        'mousemove',
        (e) => {
            mouseX = e.clientX;
            mouseY = e.clientY;
            isActive = true;
        },
        { passive: true }
    );

    heroEl.addEventListener('mouseleave', () => {
        isActive = false; // balik ke posisi netral (0,0) via lerp
    });

    function computeTargets() {
        targets.forEach((t) => {
            if (!isActive || mouseX === null) {
                t.target.rx = 0;
                t.target.ry = 0;
                return;
            }

            const rect = t.el.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            // Jarak mouse dari titik tengah OBJEK INI SENDIRI, bukan layar
            const dx = mouseX - centerX;
            const dy = mouseY - centerY;

            // Normalisasi ke rentang -1..1 pakai setengah lebar/tinggi viewport
            const nx = Math.max(-1, Math.min(1, dx / (window.innerWidth / 2)));
            const ny = Math.max(-1, Math.min(1, dy / (window.innerHeight / 2)));

            // Mouse di KANAN objek -> rotateY positif (noleh kanan)
            // Kalau di project kamu arahnya kebalik pas dicoba, tinggal
            // kasih tanda minus di dua baris di bawah ini.
            t.target.ry = nx * t.maxTiltDeg;
            t.target.rx = -ny * t.maxTiltDeg * 0.6;
        });
    }

    function lerp(a, b, n) {
        return a + (b - a) * n;
    }

    function tick() {
        computeTargets();

        targets.forEach((t) => {
            // 0.08 = kecepatan "susul" ke target, kecilin biar lebih lamban/berat,
            // gedein biar lebih responsif/cepat
            t.current.rx = lerp(t.current.rx, t.target.rx, 0.08);
            t.current.ry = lerp(t.current.ry, t.target.ry, 0.08);

            t.el.style.transform =
                `${t.baseTransform}perspective(${t.perspective}px) ` +
                `rotateX(${t.current.rx.toFixed(2)}deg) ` +
                `rotateY(${t.current.ry.toFixed(2)}deg)`;
        });

        requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
})();