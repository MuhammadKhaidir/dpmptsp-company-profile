(function () {
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;

    var holder = document.getElementById('belida-fish');
    var img = document.getElementById('belidaFishImg');
    if (!holder || !img) return;

    // Animasi cuma pakai frame 13-71 — frame 1-12 gak dimuat sama sekali.
    var FIRST_FRAME = 13;
    var TOTAL_FRAMES = 71;
    var FRAME_PATH = function (n) { return 'Assets/Video/Belida (' + n + ').png'; };

    // -- preload frame 13-71 biar gak flicker pas ganti gambar --------------
    var preloaded = new Array(TOTAL_FRAMES + 1);
    for (var i = FIRST_FRAME; i <= TOTAL_FRAMES; i++) {
        var im = new Image();
        im.src = FRAME_PATH(i);
        preloaded[i] = im;
    }

    var STOP_TEXT_SELECTOR = '#profilVisiMisiContent .intro, #profilVisiMisiContent .text-content, #profilVisiMisiContent p, #profilVisiMisiContent h2, #profilVisiMisiContent';

    var stopScrollY = Infinity;

    function computeStopY() {
        var el = document.querySelector(STOP_TEXT_SELECTOR);
        if (!el) {
            console.warn('[BelidaFish] Elemen teks Profil/Visi/Misi gak ketemu, pakai fallback dekat akhir halaman.');
            return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        }
        var rect = el.getBoundingClientRect();
        // pakai BOTTOM elemen: stop pas bagian bawah teks itu udah lewat atas viewport
        return rect.bottom + window.scrollY;
    }

    function refreshStopY() {
        stopScrollY = computeStopY();
    }

    // -- ganti frame gambar ---------------------------------------------------
    var currentFrame = -1;
    function setImageFrame(fRaw) {
        var f = Math.round(fRaw);
        f = Math.max(FIRST_FRAME, Math.min(TOTAL_FRAMES, f));
        if (f !== currentFrame) {
            currentFrame = f;
            img.src = (preloaded[f] && preloaded[f].src) || FRAME_PATH(f);
        }
    }

    // Seberapa jauh ikan turun dibanding jarak scroll asli.
    // >1 = turunnya lebih cepat dari "kamera" (scroll). Diperlambat dari sebelumnya.
    var SPEED_FACTOR = 1.15;

    function setPosition(scrollY) {
        var y = scrollY * SPEED_FACTOR;
        img.style.transform = 'translate(-50%, calc(-120% + ' + y + 'px))';
    }

    var isHidden = false;
    function setHidden(hidden) {
        if (hidden === isHidden) return;
        isHidden = hidden;
        img.classList.toggle('is-hidden', hidden);
    }

    var ticking = false;
    function updateFromScroll() {
        ticking = false;
        var scrollY = Math.max(0, window.scrollY);

        setPosition(scrollY);

        var progress = stopScrollY > 0 ? Math.min(1, scrollY / stopScrollY) : 1;
        setImageFrame(FIRST_FRAME + progress * (TOTAL_FRAMES - FIRST_FRAME));

        setHidden(scrollY >= stopScrollY);
    }

    // -- idle: pas berhenti scroll, ikan tetap "megap-megap" di tempat -------
    var IDLE_SEQUENCE = [];
    for (var a = FIRST_FRAME; a <= FIRST_FRAME + 11; a++) IDLE_SEQUENCE.push(a);
    for (var b = 65; b <= 71; b++) IDLE_SEQUENCE.push(b);

    var idleIndex = 0;
    var idleTimer = null;
    var IDLE_FRAME_MS = 110;

    function idleTick() {
        if (!isHidden) setImageFrame(IDLE_SEQUENCE[idleIndex]);
        idleIndex = (idleIndex + 1) % IDLE_SEQUENCE.length;
        idleTimer = setTimeout(idleTick, IDLE_FRAME_MS);
    }

    function startIdle() {
        if (idleTimer) return;
        idleIndex = 0;
        idleTick();
    }

    function stopIdle() {
        if (idleTimer) {
            clearTimeout(idleTimer);
            idleTimer = null;
        }
    }

    var SCROLL_IDLE_DELAY = 220;
    var scrollTimeout = null;

    function onScroll() {
        stopIdle();
        if (!ticking) {
            ticking = true;
            requestAnimationFrame(updateFromScroll);
        }
        if (scrollTimeout) clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(startIdle, SCROLL_IDLE_DELAY);
    }

    window.addEventListener('scroll', onScroll, { passive: true });

    var resizeTimeout = null;
    function onResize() {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(function () {
            refreshStopY();
            updateFromScroll();
        }, 150);
    }
    window.addEventListener('resize', onResize);

    refreshStopY();
    window.addEventListener('load', function () {
        refreshStopY();
        updateFromScroll();
    });

    if (window.scrollY > 0) {
        updateFromScroll();
        scrollTimeout = setTimeout(startIdle, SCROLL_IDLE_DELAY);
    } else {
        setPosition(0);
        setImageFrame(FIRST_FRAME);
        startIdle();
    }
})();